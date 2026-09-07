import { Router } from 'express'
import {
  initializePayment,
  verifyPayment,
  listPayments,
  getReceipt,
} from '../controllers/paymentsController.js'
import { requireAdminAuth } from '../middleware/requireAdminAuth.js'
import { bookingLimiter } from '../middleware/rateLimiter.js'

const router = Router()

// Public
router.post('/initialize', bookingLimiter, initializePayment)
router.get('/verify/:reference', verifyPayment)

// Admin
router.get('/', requireAdminAuth, listPayments)
router.get('/receipt/:bookingId', requireAdminAuth, getReceipt)

// NOTE: the webhook route is mounted separately in server.js so it can use
// the raw body parser for signature verification.

export default router
