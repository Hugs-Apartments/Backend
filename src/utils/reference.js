import crypto from 'node:crypto'

// Human-readable booking reference, e.g. HUGS-2026-A1B2C3
export function makeBookingRef() {
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6)
  return `HUGS-${new Date().getFullYear()}-${rand}`
}
