import { Router } from 'express'
import { subscribe } from '../controllers/subscribeController.js'
import { bookingLimiter } from '../middleware/rateLimiter.js'

const router = Router()

// Public — reuse the tighter limiter to blunt signup spam.
router.post('/', bookingLimiter, subscribe)

export default router
