import { Router } from 'express'
import {
  submitFeedback,
  listFeedback,
  listFeedbackHighlights,
  dispatchFeedbackRequests,
} from '../controllers/feedbackController.js'
import { requireAdminAuth } from '../middleware/requireAdminAuth.js'
import { requireCronOrAdmin } from '../middleware/requireCronOrAdmin.js'

const router = Router()

// Public: a guest submits post-stay feedback.
router.post('/', submitFeedback)

// Public: genuine 5-star reviews for the homepage testimonials.
router.get('/highlights', listFeedbackHighlights)

// Cron (or admin) triggers the post-checkout feedback emails.
router.get('/dispatch', requireCronOrAdmin, dispatchFeedbackRequests)
router.post('/dispatch', requireCronOrAdmin, dispatchFeedbackRequests)

// Admin: read all feedback.
router.get('/', requireAdminAuth, listFeedback)

export default router
