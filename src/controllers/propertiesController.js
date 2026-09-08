import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { asyncHandler, httpError } from '../middleware/errorHandler.js'
import { logger } from '../lib/logger.js'

const propertySchema = z.object({
  name: z.string().min(1),
  type: z.enum(['Studio', '1-Bedroom', '2-Bedroom', 'Penthouse']),
  description: z.string().default(''),
  price_per_night: z.number().nonnegative(),
  max_guests: z.number().int().positive(),
  amenities: z.array(z.string()).default([]),
  images: z.array(z.string()).default([]),
  location: z.string().default('Maryland, Lagos'),
  area: z.string().optional(),
  rating: z.number().min(0).max(5).optional(),
  review_count: z.number().int().nonnegative().optional(),
  is_active: z.boolean().default(true),
})

// GET /api/properties  — public. Supports ?type=&active=&guests=
export const listProperties = asyncHandler(async (req, res) => {
  let q = supabaseAdmin.from('properties').select('*').order('created_at', { ascending: false })

  // Public callers only ever see active listings; admins can pass ?all=true.
  const showAll = req.admin && req.query.all === 'true'
  if (!showAll) q = q.eq('is_active', true)

  if (req.query.type) q = q.eq('type', req.query.type)
  if (req.query.guests) q = q.gte('max_guests', Number(req.query.guests))

  const { data, error } = await q
  if (error) throw error
  res.json({ properties: data })
})

// GET /api/properties/:id — public
export const getProperty = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('properties')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle()
  if (error) throw error
  if (!data) throw httpError(404, 'Property not found.')
  res.json({ property: data })
})

// POST /api/properties — admin
export const createProperty = asyncHandler(async (req, res) => {
  const input = propertySchema.parse(req.body)
  const { data, error } = await supabaseAdmin
    .from('properties')
    .insert(input)
    .select('*')
    .single()
  if (error) throw error
  logger.info('property.created', { propertyId: data.id, by: req.admin?.sub })
  res.status(201).json({ property: data })
})

// PUT /api/properties/:id — admin
export const updateProperty = asyncHandler(async (req, res) => {
  const input = propertySchema.partial().parse(req.body)
  const { data, error } = await supabaseAdmin
    .from('properties')
    .update(input)
    .eq('id', req.params.id)
    .select('*')
    .maybeSingle()
  if (error) throw error
  if (!data) throw httpError(404, 'Property not found.')
  logger.info('property.updated', { propertyId: data.id, by: req.admin?.sub })
  res.json({ property: data })
})

// DELETE /api/properties/:id — admin
export const deleteProperty = asyncHandler(async (req, res) => {
  // Guard: refuse if there are active (pending or completed) bookings.
  const { count, error: cErr } = await supabaseAdmin
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', req.params.id)
    .in('status', ['pending', 'completed'])
  if (cErr) throw cErr
  if (count && count > 0) {
    throw httpError(409, 'Cannot delete: this property has active bookings. Deactivate it instead.')
  }

  const { error } = await supabaseAdmin.from('properties').delete().eq('id', req.params.id)
  if (error) throw error
  logger.info('property.deleted', { propertyId: req.params.id, by: req.admin?.sub })
  res.json({ ok: true })
})
