import { Router } from 'express'
import {
  createBooking,
  getBookingByReference,
  getBooking,
  listBookings,
  updateBookingStatus,
} from '../controllers/bookingsController.js'
import { requireAdminAuth } from '../middleware/requireAdminAuth.js'
import { bookingLimiter } from '../middleware/rateLimiter.js'

const router = Router()

// Public
router.post('/', bookingLimiter, createBooking)
router.get('/reference/:reference', getBookingByReference)

// Admin
router.get('/', requireAdminAuth, listBookings)
router.get('/:id', requireAdminAuth, getBooking)
router.patch('/:id/status', requireAdminAuth, updateBookingStatus)

export default router
