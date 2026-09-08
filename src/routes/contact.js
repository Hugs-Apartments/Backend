import { Router } from 'express'
import { contact } from '../controllers/contactController.js'
import { bookingLimiter } from '../middleware/rateLimiter.js'

const router = Router()

// Public — reuse the tighter limiter to blunt contact-form spam.
router.post('/', bookingLimiter, contact)

export default router
