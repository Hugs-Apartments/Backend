import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { asyncHandler, httpError } from '../middleware/errorHandler.js'
import { logger } from '../lib/logger.js'
import {
  initializeTransaction,
  verifyTransaction,
  verifyWebhookSignature,
} from '../lib/paystack.js'
import { sendBookingConfirmation } from '../lib/notifier.js'
import { isRangeAvailable } from '../utils/availability.js'
import { getOccupiedRanges } from '../utils/occupancy.js'

const initSchema = z.object({ booking_id: z.string().uuid() })

// Marks a booking confirmed + records the payment. Idempotent: safe to call
// from both the webhook and the verify endpoint. A successful payment is the
// single source of truth — no manual admin confirmation is needed. On the
// first transition to confirmed we email the guest a PDF receipt.
async function confirmBookingPayment(booking, providerRef, rawResponse) {
  // Record/upsert the payment row.
  const { error: payErr } = await supabaseAdmin
    .from('payments')
    .upsert(
      {
        booking_id: booking.id,
        provider: 'paystack',
        reference: providerRef,
        amount: booking.total_amount,
        status: 'success',
        raw_response: rawResponse ?? null,
      },
      { onConflict: 'reference' },
    )
  if (payErr) throw payErr

  // Only flip status + notify if not already confirmed (idempotency guard —
  // the webhook and the verify endpoint can both fire for one payment).
  const firstConfirmation = booking.status !== 'confirmed'
  if (firstConfirmation) {
    const { error } = await supabaseAdmin
      .from('bookings')
      .update({ status: 'confirmed', payment_status: 'success' })
      .eq('id', booking.id)
    if (error) throw error
  }
  logger.info('payment.confirmed', { bookingId: booking.id, reference: providerRef })

  if (firstConfirmation) {
    await notifyGuest(booking.id, providerRef)
  }
}

// Loads the confirmed booking with property details and emails the guest a
// PDF receipt via the Apps Script notifier. Failures are logged, not thrown —
// a booking must stay confirmed even if email delivery hiccups.
async function notifyGuest(bookingId, providerRef) {
  try {
    const { data: full, error } = await supabaseAdmin
      .from('bookings')
      .select('*, property:properties(name, type, location, area)')
      .eq('id', bookingId)
      .maybeSingle()
    if (error) throw error
    if (!full) return

    await sendBookingConfirmation({
      receipt: buildReceipt(full),
      payment: {
        reference: providerRef,
        provider: 'paystack',
        amount: full.total_amount,
        currency: 'NGN',
        paid_at: new Date().toISOString(),
      },
    })
  } catch (err) {
    logger.error('payment.notify_failed', { bookingId, error: err.message })
  }
}

// POST /api/payments/initialize — public
export const initializePayment = asyncHandler(async (req, res) => {
  const { booking_id } = initSchema.parse(req.body)

  const { data: booking, error } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('id', booking_id)
    .maybeSingle()
  if (error) throw error
  if (!booking) throw httpError(404, 'Booking not found.')
  if (booking.status === 'confirmed') throw httpError(409, 'Booking is already paid.')
  if (booking.status === 'cancelled') throw httpError(409, 'Booking was cancelled.')

  // Re-check availability at payment time to guard against a race where the
  // dates were taken between booking creation and payment.
  const occupied = await getOccupiedRanges(booking.property_id, booking.id)
  if (!isRangeAvailable(booking.check_in, booking.check_out, occupied)) {
    throw httpError(409, 'Those dates are no longer available.')
  }

  const init = await initializeTransaction({
    email: booking.guest_email,
    amountNaira: Number(booking.total_amount),
    reference: booking.reference,
    metadata: { booking_id: booking.id },
  })

  // Track a pending payment row.
  await supabaseAdmin.from('payments').upsert(
    {
      booking_id: booking.id,
      provider: 'paystack',
      reference: booking.reference,
      amount: booking.total_amount,
      status: 'pending',
    },
    { onConflict: 'reference' },
  )

  logger.info('payment.initialized', { bookingId: booking.id, reference: booking.reference })
  res.json({
    authorization_url: init.authorization_url,
    reference: booking.reference,
    access_code: init.access_code,
    simulated: init.simulated ?? false,
  })
})

// GET /api/payments/verify/:reference — public. Called after redirect back.
export const verifyPayment = asyncHandler(async (req, res) => {
  const reference = req.params.reference

  const { data: booking, error } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('reference', reference)
    .maybeSingle()
  if (error) throw error
  if (!booking) throw httpError(404, 'Booking not found.')

  const result = await verifyTransaction(reference)
  if (result.status === 'success') {
    await confirmBookingPayment(booking, reference, result.raw)
    return res.json({ status: 'success', booking_reference: reference })
  }

  await supabaseAdmin
    .from('bookings')
    .update({ payment_status: 'failed' })
    .eq('id', booking.id)
  res.json({ status: result.status ?? 'failed', booking_reference: reference })
})

// POST /api/payments/webhook — Paystack server-to-server callback.
// Uses the raw body captured in server.js for signature verification.
export const paystackWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-paystack-signature']
  const raw = req.rawBody

  if (!verifyWebhookSignature(raw, signature)) {
    logger.warn('payment.webhook_bad_signature', {})
    return res.status(401).json({ error: 'Invalid signature.' })
  }

  const event = req.body
  if (event?.event === 'charge.success') {
    const reference = event.data?.reference
    const { data: booking } = await supabaseAdmin
      .from('bookings')
      .select('*')
      .eq('reference', reference)
      .maybeSingle()
    if (booking) {
      await confirmBookingPayment(booking, reference, event.data)
    }
  }

  // Always 200 quickly so Paystack does not retry unnecessarily.
  res.sendStatus(200)
})

// GET /api/payments — admin. List transactions.
export const listPayments = asyncHandler(async (req, res) => {
  let q = supabaseAdmin
    .from('payments')
    .select('*, booking:bookings(reference, guest_name, property_id)')
    .order('created_at', { ascending: false })
  if (req.query.status) q = q.eq('status', req.query.status)

  const { data, error } = await q
  if (error) throw error
  res.json({ payments: data })
})

// GET /api/payments/receipt/:bookingId — receipt as HTML (admin or via reference)
export const getReceipt = asyncHandler(async (req, res) => {
  const { data: booking, error } = await supabaseAdmin
    .from('bookings')
    .select('*, property:properties(name, type, location, area)')
    .eq('id', req.params.bookingId)
    .maybeSingle()
  if (error) throw error
  if (!booking) throw httpError(404, 'Booking not found.')
  if (booking.status !== 'confirmed') {
    throw httpError(409, 'Receipt is only available for confirmed bookings.')
  }
  res.json({ receipt: buildReceipt(booking) })
})

function buildReceipt(booking) {
  return {
    reference: booking.reference,
    issued_at: new Date().toISOString(),
    guest: { name: booking.guest_name, email: booking.guest_email },
    property: booking.property,
    stay: {
      check_in: booking.check_in,
      check_out: booking.check_out,
      nights: booking.nights,
      guests: booking.guests,
    },
    charges: {
      subtotal: booking.subtotal,
      service_fee: booking.service_fee,
      total: booking.total_amount,
      currency: 'NGN',
    },
    status: booking.status,
  }
}
