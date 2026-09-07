import { ZodError } from 'zod'
import { logger } from '../lib/logger.js'

// 404 for unmatched routes.
export function notFound(req, res) {
  res.status(404).json({ error: 'Not found.' })
}

// Central error handler. Must have 4 args for Express to recognise it.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Validation errors -> 400 with field details.
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed.',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }

  if (err?.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed.' })
  }

  const status = err.status || 500
  logger.error('unhandled_error', { message: err.message, status, stack: err.stack })

  res.status(status).json({
    error: status === 500 ? 'Internal server error.' : err.message,
  })
}

// Wrap async controllers so thrown errors reach the error handler.
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
}

// Helper to throw HTTP errors with a status code.
export function httpError(status, message) {
  const e = new Error(message)
  e.status = status
  return e
}
