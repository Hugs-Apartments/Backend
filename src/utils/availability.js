// Core availability / overlap-checking logic.
//
// Two date ranges [aStart, aEnd) and [bStart, bEnd) overlap when
//   aStart < bEnd AND bStart < aEnd
// Check-out day is exclusive (a guest leaving on the 10th frees the 10th for
// a guest arriving on the 10th), which is why comparisons are strict.

export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  const as = new Date(aStart)
  const ae = new Date(aEnd)
  const bs = new Date(bStart)
  const be = new Date(bEnd)
  return as < be && bs < ae
}

export function nightsBetween(checkIn, checkOut) {
  const a = new Date(checkIn)
  const b = new Date(checkOut)
  const ms = b - a
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)))
}

// Given the existing confirmed/pending bookings and manual blocks for a
// property, decide whether a requested [checkIn, checkOut) range is free.
// `occupied` is an array of { start, end } ranges.
export function isRangeAvailable(checkIn, checkOut, occupied = []) {
  return !occupied.some((o) => rangesOverlap(checkIn, checkOut, o.start, o.end))
}

// Basic ISO date (yyyy-mm-dd) validation + ordering.
export function validateDateRange(checkIn, checkOut) {
  const iso = /^\d{4}-\d{2}-\d{2}$/
  if (!iso.test(checkIn) || !iso.test(checkOut)) {
    return { ok: false, error: 'Dates must be in YYYY-MM-DD format.' }
  }
  const a = new Date(checkIn)
  const b = new Date(checkOut)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
    return { ok: false, error: 'Invalid date.' }
  }
  if (b <= a) {
    return { ok: false, error: 'Check-out must be after check-in.' }
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (a < today) {
    return { ok: false, error: 'Check-in cannot be in the past.' }
  }
  return { ok: true }
}
