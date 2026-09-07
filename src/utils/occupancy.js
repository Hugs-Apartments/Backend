import { supabaseAdmin } from '../lib/supabaseAdmin.js'

// Gathers all occupied ranges for a property: active bookings (pending or
// confirmed) plus manual admin blocks. Returns [{ start, end }].
// `excludeBookingId` lets a booking ignore its own row when re-checking.
export async function getOccupiedRanges(propertyId, excludeBookingId = null) {
  let bookingQ = supabaseAdmin
    .from('bookings')
    .select('id, check_in, check_out')
    .eq('property_id', propertyId)
    .in('status', ['pending', 'confirmed'])
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
