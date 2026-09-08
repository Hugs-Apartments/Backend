import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { requireAdminAuth } from './requireAdminAuth.js'

// Allows a request through if it carries either:
//   1) the shared cron secret as `Authorization: Bearer <CRON_SECRET>`
//      (Vercel Cron sends this automatically when CRON_SECRET is set), or
//   2) a valid admin JWT (so an admin can also trigger the job manually).
export function requireCronOrAdmin(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  // Cron secret path.
  if (token && config.cronSecret && token === config.cronSecret) {
    req.viaCron = true
    return next()
  }

  // Otherwise require a valid admin token.
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwt.secret)
      if (payload.type === 'admin') {
        req.admin = payload
        return next()
      }
    } catch {
      /* fall through to 401 below */
    }
  }

  return res.status(401).json({ error: 'Authentication required.' })
}

// Re-export for convenience where a plain admin guard is wanted alongside.
export { requireAdminAuth }
