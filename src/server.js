import express from 'express'
import helmet from 'helmet'
import morgan from 'morgan'

import { config } from './config.js'
import { logger } from './lib/logger.js'
import { corsMiddleware } from './middleware/cors.js'
import { apiLimiter } from './middleware/rateLimiter.js'
import { notFound, errorHandler } from './middleware/errorHandler.js'

import authRoutes from './routes/auth.js'
import propertiesRoutes from './routes/properties.js'
import bookingsRoutes from './routes/bookings.js'
import paymentsRoutes from './routes/payments.js'
import discountsRoutes from './routes/discounts.js'
import feedbackRoutes from './routes/feedback.js'
import statsRoutes from './routes/stats.js'
import subscribeRoutes from './routes/subscribe.js'
import contactRoutes from './routes/contact.js'
import { paystackWebhook } from './controllers/paymentsController.js'

const app = express()

// Trust proxy so rate-limit / IP detection works behind a load balancer.
app.set('trust proxy', 1)

app.use(helmet())
app.use(corsMiddleware)
app.use(morgan(config.env === 'production' ? 'combined' : 'dev'))

// --- Webhook FIRST, with raw body capture for signature verification. ---
// Must be registered before express.json() so the raw bytes are preserved.
app.post(
  '/api/payments/webhook',
  express.raw({ type: '*/*' }),
  (req, _res, next) => {
    req.rawBody = req.body // Buffer
    try {
      req.body = req.body?.length ? JSON.parse(req.body.toString('utf8')) : {}
    } catch {
      req.body = {}
    }
    next()
  },
  paystackWebhook,
)

// --- Normal JSON parsing for everything else. ---
app.use(express.json({ limit: '1mb' }))

// Health check.
app.get('/health', (_req, res) => res.json({ status: 'ok', env: config.env }))

// Rate-limit the API surface.
app.use('/api', apiLimiter)

// Routes.
app.use('/api/auth', authRoutes)
app.use('/api/properties', propertiesRoutes)
app.use('/api/bookings', bookingsRoutes)
app.use('/api/payments', paymentsRoutes)
app.use('/api/discounts', discountsRoutes)
app.use('/api/feedback', feedbackRoutes)
app.use('/api/stats', statsRoutes)
app.use('/api/subscribe', subscribeRoutes)
app.use('/api/contact', contactRoutes)

// 404 + error handling.
app.use(notFound)
app.use(errorHandler)

app.listen(config.port, () => {
  logger.info('server.started', { port: config.port, env: config.env })
})

export default app
