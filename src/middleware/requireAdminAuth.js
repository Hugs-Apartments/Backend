import jwt from 'jsonwebtoken'
import { config } from '../config.js'

// Verifies a Bearer JWT and attaches the admin payload to req.admin.
export function requireAdminAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' })
  }

  try {
    const payload = jwt.verify(token, config.jwt.secret)
    if (payload.type !== 'admin') {
      return res.status(403).json({ error: 'Admin access required.' })
    }
    req.admin = payload
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' })
  }
}

// Restrict a route to superadmins only (e.g. managing other admins).
export function requireSuperAdmin(req, res, next) {
  if (req.admin?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Superadmin access required.' })
  }
  next()
}

// Optional auth: if a valid admin Bearer token is present, attach req.admin;
// otherwise continue as an anonymous (public) request. Used on endpoints that
// are public but return MORE to an authenticated admin — e.g. GET /properties,
// where the public sees only active listings but an admin can pass ?all=true.
export function attachAdminIfPresent(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwt.secret)
      if (payload.type === 'admin') req.admin = payload
    } catch {
      // Invalid/expired token on a public route — ignore and treat as anonymous.
    }
  }
  next()
}
