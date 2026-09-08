import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { asyncHandler, httpError } from '../middleware/errorHandler.js'
import { config } from '../config.js'
import { logger } from '../lib/logger.js'
import { sendFeedbackRequest } from '../lib/notifier.js'

// ---------------------------------------------------------------------------
// Public: POST /api/feedback — a guest leaves a rating + comment after a stay.
// This does NOT change a listing's displayed rating (that stays admin-set);
// it's collected so the team can improve the experience.
// ---------------------------------------------------------------------------
const feedbackSchema = z.object({
  reference: z.string().optional(),
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  property_id: z.string().uuid().optional(),
})

export const submitFeedback = asyncHandler(async (req, res) => {
  const input = feedbackSchema.parse(req.body)

  // If a booking reference is supplied, link it and stamp the booking so we
  // don't chase the guest again.
  let bookingId = null
  let propertyId = input.property_id ?? null
  if (input.reference) {
    const { data: booking } = await supabaseAdmin
      .from('bookings')
      .select('id, property_id')
      .eq('reference', input.reference.trim())
      .maybeSingle()
    if (booking) {
      bookingId = booking.id
      propertyId = propertyId || booking.property_id
    }
  }

  const { data, error } = await supabaseAdmin
    .from('feedback')
    .insert({
      booking_id: bookingId,
      property_id: propertyId,
      reference: input.reference?.trim() || null,
      guest_name: input.name,
      guest_email: input.email || null,
      rating: input.rating,
      comment: input.comment?.trim() || null,
    })
    .select('*')
    .single()
  if (error) throw error

  if (bookingId) {
    await supabaseAdmin
      .from('bookings')
      .update({ feedback_submitted_at: new Date().toISOString() })
      .eq('id', bookingId)
  }

  logger.info('feedback.submitted', { feedbackId: data.id, rating: data.rating })
  res.status(201).json({ ok: true, feedback: data })
})

// ---------------------------------------------------------------------------
// Admin: GET /api/feedback — list all feedback (newest first).
// ---------------------------------------------------------------------------
export const listFeedback = asyncHandler(async (req, res) => {
  let q = supabaseAdmin
    .from('feedback')
    .select('*, property:properties(name, type)')
    .order('created_at', { ascending: false })
  if (req.query.property_id) q = q.eq('property_id', req.query.property_id)

  const { data, error } = await q
  if (error) throw error
  res.json({ feedback: data })
})

// ---------------------------------------------------------------------------
// Cron/admin: GET|POST /api/feedback/dispatch — email a thank-you + feedback
// request to guests whose checkout date has passed and who haven't been asked
// yet. Idempotent: each booking is stamped `feedback_requested_at` once sent,
// so re-running never double-emails.
// ---------------------------------------------------------------------------
export const dispatchFeedbackRequests = asyncHandler(async (req, res) => {
  const today = new Date().toISOString().slice(0, 10)

  // Completed (paid) stays that have ended, not yet asked for feedback.
  const { data: due, error } = await supabaseAdmin
    .from('bookings')
    .select('id, reference, guest_name, guest_email, check_out, property:properties(name)')
    .eq('status', 'completed')
    .lt('check_out', today)
    .is('feedback_requested_at', null)
    .limit(200)
  if (error) throw error

  let sent = 0
  for (const b of due ?? []) {
    if (!b.guest_email) continue
    const feedbackUrl = config.publicUrl
      ? `${config.publicUrl}/feedback?ref=${encodeURIComponent(b.reference)}`
      : ''
    const result = await sendFeedbackRequest({
      name: b.guest_name,
      email: b.guest_email,
      reference: b.reference,
      propertyName: b.property?.name,
      feedbackUrl,
    })
    // Stamp only when the email actually went out (or was intentionally skipped
    // because the mailer isn't configured) — but never retry a hard failure
    // forever: we still stamp on skip so a missing mailer doesn't pile up.
    if (result.ok || result.skipped) {
      await supabaseAdmin
        .from('bookings')
        .update({ feedback_requested_at: new Date().toISOString() })
        .eq('id', b.id)
      if (result.ok) sent += 1
    }
  }

  logger.info('feedback.dispatch', { candidates: due?.length ?? 0, sent, via: req.viaCron ? 'cron' : 'admin' })
  res.json({ ok: true, candidates: due?.length ?? 0, sent })
})
