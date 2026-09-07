import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { asyncHandler, httpError } from '../middleware/errorHandler.js'
import { config } from '../config.js'
import { logger } from '../lib/logger.js'
import { makeBookingRef } from '../utils/reference.js'
import { validateDateRange, isRangeAvailable, nightsBetween } from '../utils/availability.js'
import { getOccupiedRanges } from '../utils/occupancy.js'

const createBookingSchema = z.object({
  property_id: z.string().uuid(),
  guest_name: z.string().min(1),
  guest_email: z.string().email(),
  guest_phone: z.string().min(7),
  notes: z.string().optional(),
  check_in: z.string(),
  check_out: z.string(),
  guests: z.number().int().positive(),
})

// POST /api/bookings — public. Creates a pending booking after validating
// availability, then returns it ready for payment initiation.
export const createBooking = asyncHandler(async (req, res) => {
  const input = createBookingSchema.parse(req.body)

  const dateCheck = validateDateRange(input.check_in, input.check_out)
  if (!dateCheck.ok) throw httpError(400, dateCheck.error)

  // Load property.
  const { data: property, error: pErr } = await supabaseAdmin
    .from('properties')
    .select('*')
    .eq('id', input.property_id)
    .maybeSingle()
  if (pErr) throw pErr
  if (!property || !property.is_active) throw httpError(404, 'Property not available.')

  if (input.guests > property.max_guests) {
    throw httpError(400, `This property holds up to ${property.max_guests} guests.`)
  }

  // Availability check against existing bookings + blocks.
  const occupied = await getOccupiedRanges(input.property_id)
  if (!isRangeAvailable(input.check_in, input.check_out, occupied)) {
    throw httpError(409, 'Those dates are no longer available.')
  }

  // Price computation happens server-side — never trust client totals.
  const nights = nightsBetween(input.check_in, input.check_out)
  const subtotal = Number(property.price_per_night) * nights
  const serviceFee = Math.round(subtotal * config.serviceFeeRate)
  const total = subtotal + serviceFee

  const { data: booking, error } = await supabaseAdmin
    .from('bookings')
    .insert({
      reference: makeBookingRef(),
      property_id: input.property_id,
      guest_name: input.guest_name,
      guest_email: input.guest_email.toLowerCase(),
      guest_phone: input.guest_phone,
      notes: input.notes ?? null,
      check_in: input.check_in,
      check_out: input.check_out,
      guests: input.guests,
      nights,
      subtotal,
      service_fee: serviceFee,
      total_amount: total,
      status: 'pending',
      payment_status: 'pending',
    })
    .select('*')
    .single()
  if (error) throw error

  logger.info('booking.created', { bookingId: booking.id, reference: booking.reference, total })
  res.status(201).json({ booking })
})

// GET /api/bookings/reference/:reference — public (guest looks up own booking)
export const getBookingByReference = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select('*, property:properties(name, type, images, location, area)')
    .eq('reference', req.params.reference)
    .maybeSingle()
  if (error) throw error
  if (!data) throw httpError(404, 'Booking not found.')
  res.json({ booking: data })
})

// GET /api/bookings/:id — admin
export const getBooking = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select('*, property:properties(name, type, images, location, area), payments(*)')
    .eq('id', req.params.id)
    .maybeSingle()
  if (error) throw error
  if (!data) throw httpError(404, 'Booking not found.')
  res.json({ booking: data })
})

// GET /api/bookings — admin. Filters: status, payment_status, property_id, from, to
export const listBookings = asyncHandler(async (req, res) => {
  let q = supabaseAdmin
    .from('bookings')
    .select('*, property:properties(name, type)')
    .order('created_at', { ascending: false })

  if (req.query.status) q = q.eq('status', req.query.status)
  if (req.query.payment_status) q = q.eq('payment_status', req.query.payment_status)
  if (req.query.property_id) q = q.eq('property_id', req.query.property_id)
  if (req.query.from) q = q.gte('check_in', req.query.from)
  if (req.query.to) q = q.lte('check_out', req.query.to)

  const { data, error } = await q
  if (error) throw error
  res.json({ bookings: data })
})

const statusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']),
})

// PATCH /api/bookings/:id/status — admin. Manual confirm/cancel/complete.
export const updateBookingStatus = asyncHandler(async (req, res) => {
  const { status } = statusSchema.parse(req.body)

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .update({ status })
    .eq('id', req.params.id)
    .select('*')
    .maybeSingle()
  if (error) throw error
  if (!data) throw httpError(404, 'Booking not found.')

  // Cancelling a booking releases its dates automatically, because
  // getOccupiedRanges only counts pending/confirmed bookings.
  logger.info('booking.status_changed', { bookingId: data.id, status, by: req.admin?.sub })
  res.json({ booking: data })
})
