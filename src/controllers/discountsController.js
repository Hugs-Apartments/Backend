import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { asyncHandler, httpError } from '../middleware/errorHandler.js'
import { logger } from '../lib/logger.js'

// A promo code either takes a percentage off (0-100) or a fixed ₦ amount off.
// Codes are stored and matched UPPERCASE so "welcome10" == "WELCOME10".

const todayISO = () => new Date().toISOString().slice(0, 10)

// Rounds a discount and clamps it so it can never exceed the subtotal.
function computeDiscount(row, subtotal) {
  const sub = Number(subtotal) || 0
  let d = row.type === 'percent' ? (sub * Number(row.value)) / 100 : Number(row.value)
  d = Math.round(d)
  return Math.max(0, Math.min(d, sub))
}

// Core validator shared by the public endpoint and by booking creation.
// Returns { ok: true, row, discount, label } or { ok: false, error }.
export async function resolvePromo(rawCode, { subtotal = 0, nights = 0 } = {}) {
  const code = String(rawCode || '').trim().toUpperCase()
  if (!code) return { ok: false, error: 'Enter a promo code.' }

  const { data: row, error } = await supabaseAdmin
    .from('promo_codes')
    .select('*')
    .eq('code', code)
    .maybeSingle()
  if (error) throw error
  if (!row || !row.active) return { ok: false, error: 'That code is not valid.' }

  const today = todayISO()
  if (row.starts_on && today < row.starts_on) return { ok: false, error: 'This code is not active yet.' }
  if (row.expires_on && today > row.expires_on) return { ok: false, error: 'This code has expired.' }
  if (row.max_uses != null && row.used_count >= row.max_uses) {
    return { ok: false, error: 'This code has reached its usage limit.' }
  }
  if (nights && row.min_nights && nights < row.min_nights) {
    return { ok: false, error: `This code needs a stay of at least ${row.min_nights} night(s).` }
  }

  const discount = computeDiscount(row, subtotal)
  const label = row.type === 'percent' ? `${Number(row.value)}% off` : `₦${Number(row.value).toLocaleString()} off`
  return { ok: true, row, discount, label }
}

// Bumps a code's usage counter (called once payment is confirmed). Best-effort:
// a failure here must never break payment confirmation.
export async function incrementPromoUsage(rawCode) {
  const code = String(rawCode || '').trim().toUpperCase()
  if (!code) return
  try {
    const { data } = await supabaseAdmin.from('promo_codes').select('id, used_count').eq('code', code).maybeSingle()
    if (data) {
      await supabaseAdmin.from('promo_codes').update({ used_count: (data.used_count || 0) + 1 }).eq('id', data.id)
    }
  } catch (e) {
    logger.error('promo.usage_increment_failed', { code, error: e.message })
  }
}

// ---------------------------------------------------------------------------
// Public: POST /api/discounts/validate  { code, subtotal, nights }
// ---------------------------------------------------------------------------
const validateSchema = z.object({
  code: z.string().min(1),
  subtotal: z.number().nonnegative().default(0),
  nights: z.number().int().nonnegative().default(0),
})

export const validateDiscount = asyncHandler(async (req, res) => {
  const input = validateSchema.parse(req.body)
  const result = await resolvePromo(input.code, { subtotal: input.subtotal, nights: input.nights })
  if (!result.ok) throw httpError(400, result.error)
  res.json({
    valid: true,
    code: result.row.code,
    type: result.row.type,
    value: Number(result.row.value),
    discount: result.discount,
    label: result.label,
  })
})

// ---------------------------------------------------------------------------
// Admin CRUD
// ---------------------------------------------------------------------------
const upsertSchema = z.object({
  code: z.string().min(2).max(32),
  type: z.enum(['percent', 'fixed']),
  value: z.number().nonnegative(),
  active: z.boolean().default(true),
  max_uses: z.number().int().positive().nullable().optional(),
  min_nights: z.number().int().nonnegative().default(0),
  starts_on: z.string().nullable().optional(),
  expires_on: z.string().nullable().optional(),
})

// GET /api/discounts — admin
export const listDiscounts = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('promo_codes')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  res.json({ codes: data })
})

// POST /api/discounts — admin
export const createDiscount = asyncHandler(async (req, res) => {
  const input = upsertSchema.parse(req.body)
  if (input.type === 'percent' && input.value > 100) throw httpError(400, 'Percentage cannot exceed 100.')
  const payload = { ...input, code: input.code.trim().toUpperCase() }

  const { data, error } = await supabaseAdmin.from('promo_codes').insert(payload).select('*').single()
  if (error) {
    if (error.code === '23505') throw httpError(409, 'A code with that name already exists.')
    throw error
  }
  logger.info('promo.created', { code: data.code, by: req.admin?.sub })
  res.status(201).json({ code: data })
})

// PATCH /api/discounts/:id — admin (partial update, e.g. toggle active)
export const updateDiscount = asyncHandler(async (req, res) => {
  const input = upsertSchema.partial().parse(req.body)
  if (input.type === 'percent' && input.value != null && input.value > 100) {
    throw httpError(400, 'Percentage cannot exceed 100.')
  }
  if (input.code) input.code = input.code.trim().toUpperCase()

  const { data, error } = await supabaseAdmin
    .from('promo_codes')
    .update(input)
    .eq('id', req.params.id)
    .select('*')
    .maybeSingle()
  if (error) {
    if (error.code === '23505') throw httpError(409, 'A code with that name already exists.')
    throw error
  }
  if (!data) throw httpError(404, 'Promo code not found.')
  logger.info('promo.updated', { code: data.code, by: req.admin?.sub })
  res.json({ code: data })
})

// DELETE /api/discounts/:id — admin
export const deleteDiscount = asyncHandler(async (req, res) => {
  const { error } = await supabaseAdmin.from('promo_codes').delete().eq('id', req.params.id)
  if (error) throw error
  logger.info('promo.deleted', { id: req.params.id, by: req.admin?.sub })
  res.json({ ok: true })
})
