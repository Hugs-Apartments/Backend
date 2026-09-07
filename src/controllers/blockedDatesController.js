import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { asyncHandler, httpError } from '../middleware/errorHandler.js'
import { logger } from '../lib/logger.js'
import { validateDateRange } from '../utils/availability.js'
import { getOccupiedRanges } from '../utils/occupancy.js'

// GET /api/properties/:id/availability?from=&to= — public
// Returns the occupied ranges so the frontend can disable them in a picker.
export const getAvailability = asyncHandler(async (req, res) => {
  const occupied = await getOccupiedRanges(req.params.id)
  res.json({ property_id: req.params.id, occupied })
})

const blockSchema = z.object({
  start_date: z.string(),
  end_date: z.string(),
  reason: z.string().optional(),
})

// GET /api/properties/:id/blocks — admin
export const listBlocks = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('blocked_dates')
    .select('*')
    .eq('property_id', req.params.id)
    .order('start_date', { ascending: true })
  if (error) throw error
  res.json({ blocks: data })
})

// POST /api/properties/:id/blocks — admin. Manually block a date range.
export const createBlock = asyncHandler(async (req, res) => {
  const input = blockSchema.parse(req.body)
  const dateCheck = validateDateRange(input.start_date, input.end_date)
  if (!dateCheck.ok) throw httpError(400, dateCheck.error)

  const { data, error } = await supabaseAdmin
    .from('blocked_dates')
    .insert({
      property_id: req.params.id,
      start_date: input.start_date,
      end_date: input.end_date,
      reason: input.reason ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  logger.info('block.created', { blockId: data.id, propertyId: req.params.id, by: req.admin?.sub })
  res.status(201).json({ block: data })
})

// DELETE /api/properties/:id/blocks/:blockId — admin. Unblock dates.
export const deleteBlock = asyncHandler(async (req, res) => {
  const { error } = await supabaseAdmin
    .from('blocked_dates')
    .delete()
    .eq('id', req.params.blockId)
    .eq('property_id', req.params.id)
  if (error) throw error
  logger.info('block.deleted', { blockId: req.params.blockId, by: req.admin?.sub })
  res.json({ ok: true })
})
