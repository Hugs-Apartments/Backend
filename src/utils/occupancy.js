import { supabaseAdmin } from '../lib/supabaseAdmin.js'

// Gathers all occupied ranges for a property: PAID bookings (status
// 'completed') plus manual admin blocks. Returns [{ start, end }].
//
// Note: unpaid ('pending') bookings do NOT occupy dates — dates are never
// held for an unpaid guest. Availability is decided by successful payment
// (completed) or a deliberate admin block only.
// `excludeBookingId` lets a booking ignore its own row when re-checking.
export async function getOccupiedRanges(propertyId, excludeBookingId = null) {
  let bookingQ = supabaseAdmin
    .from('bookings')
    .select('id, check_in, check_out')
    .eq('property_id', propertyId)
    .eq('status', 'completed')
  if (excludeBookingId) bookingQ = bookingQ.neq('id', excludeBookingId)

  const [{ data: bookings, error: bErr }, { data: blocks, error: blErr }] = await Promise.all([
    bookingQ,
    supabaseAdmin
      .from('blocked_dates')
      .select('start_date, end_date')
      .eq('property_id', propertyId),
  ])
  if (bErr) throw bErr
  if (blErr) throw blErr

  const ranges = []
  for (const b of bookings ?? []) ranges.push({ start: b.check_in, end: b.check_out })
  for (const bl of blocks ?? []) ranges.push({ start: bl.start_date, end: bl.end_date })
  return ranges
}
