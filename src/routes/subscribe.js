import { Router } from 'express'
import { subscribe, listSubscribers } from '../controllers/subscribeController.js'
import { requireAdminAuth } from '../middleware/requireAdminAuth.js'
import { bookingLimiter } from '../middleware/rateLimiter.js'

const router = Router()

// Public — reuse the tighter limiter to blunt signup spam.
router.post('/', bookingLimiter, subscribe)

// Admin — view / export the subscriber list.
router.get('/', requireAdminAuth, listSubscribers)

export default router
