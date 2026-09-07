import cors from 'cors'
import { config } from '../config.js'

// Origin allow-list driven by ALLOWED_ORIGINS. Requests with no Origin
// (server-to-server, curl) are allowed through.
export const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin || config.allowedOrigins.includes(origin)) {
      return callback(null, true)
    }
    return callback(new Error('Not allowed by CORS'))
  },
  credentials: true,
})
