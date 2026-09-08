import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { sendSubscribe } from '../lib/notifier.js'
import { logger } from '../lib/logger.js'

const subscribeSchema = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
})

// POST /api/subscribe — public. Records a newsletter subscriber in our own
// `subscribers` table (so the admin can view and export the list) AND via the
// Apps Script web app (which appends to a Google Sheet and sends a welcome
// mail). We always respond 200 with a friendly message so the form never leaks
// whether an address is already on the list.
export const subscribe = asyncHandler(async (req, res) => {
  const { email, name } = subscribeSchema.parse(req.body)
  const normalised = email.toLowerCase()

  // Idempotent on email — re-subscribing just refreshes the stored name.
  const { error } = await supabaseAdmin
    .from('subscribers')
    .upsert({ email: normalised, name: name ?? null }, { onConflict: 'email' })
  if (error) logger.error('subscribe.persist_failed', { error: error.message })

  const result = await sendSubscribe({ email: normalised, name })
  logger.info('subscribe.requested', { ok: result.ok })
  res.json({ message: 'Thanks for subscribing — please check your inbox.' })
})

// GET /api/subscribe — admin. Returns the full subscriber list, newest first,
// for the dashboard's subscribers view and CSV export.
export const listSubscribers = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('subscribers')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  res.json({ subscribers: data ?? [] })
})
