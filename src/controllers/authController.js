import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { config } from '../config.js'
import { asyncHandler, httpError } from '../middleware/errorHandler.js'
import { logger } from '../lib/logger.js'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const createAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(['admin', 'superadmin']).default('admin'),
})

function signToken(admin) {
  return jwt.sign(
    { sub: admin.id, email: admin.email, name: admin.name, role: admin.role, type: 'admin' },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn },
  )
}

// POST /api/auth/admin/login
export const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body)

  const { data: admin, error } = await supabaseAdmin
    .from('admin_users')
    .select('*')
    .eq('email', email.toLowerCase())
    .maybeSingle()

  // Same response whether the email exists or not, to avoid user enumeration.
  if (error) throw error
  if (!admin) {
    logger.warn('auth.login_failed', { email })
    throw httpError(401, 'Invalid credentials.')
  }

  const ok = await bcrypt.compare(password, admin.password_hash)
  if (!ok) {
    logger.warn('auth.login_failed', { email })
    throw httpError(401, 'Invalid credentials.')
  }

  logger.info('auth.login_success', { adminId: admin.id })
  const token = signToken(admin)
  res.json({
    token,
    admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
  })
})

// GET /api/auth/admin/me
export const adminMe = asyncHandler(async (req, res) => {
  res.json({ admin: req.admin })
})

// POST /api/auth/admin  (superadmin only) — create another admin
export const createAdmin = asyncHandler(async (req, res) => {
  const input = createAdminSchema.parse(req.body)
  const password_hash = await bcrypt.hash(input.password, 12)

  const { data, error } = await supabaseAdmin
    .from('admin_users')
    .insert({
      email: input.email.toLowerCase(),
      password_hash,
      name: input.name,
      role: input.role,
    })
    .select('id, email, name, role, created_at')
    .single()

  if (error) {
    if (error.code === '23505') throw httpError(409, 'An admin with that email already exists.')
    throw error
  }

  logger.info('auth.admin_created', { adminId: data.id, by: req.admin?.sub })
  res.status(201).json({ admin: data })
})

// GET /api/auth/admin  (superadmin only) — list admins
export const listAdmins = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('admin_users')
    .select('id, email, name, role, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  res.json({ admins: data })
})

// DELETE /api/auth/admin/:id  (superadmin only)
export const deleteAdmin = asyncHandler(async (req, res) => {
  if (req.params.id === req.admin.sub) {
    throw httpError(400, 'You cannot delete your own account.')
  }
  const { error } = await supabaseAdmin.from('admin_users').delete().eq('id', req.params.id)
  if (error) throw error
  res.json({ ok: true })
})
