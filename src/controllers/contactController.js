import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { sendContactMessage } from '../lib/notifier.js'
import { logger } from '../lib/logger.js'

const contactSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  phone: z.string().max(40).optional(),
  message: z.string().min(5).max(4000),
})

// POST /api/contact — public. Relays a contact-form enquiry: the Apps Script
// mailer emails the business inbox (so the team sees the message) and sends the
// sender an acknowledgement. We reply 200 with a friendly message either way.
export const contact = asyncHandler(async (req, res) => {
  const input = contactSchema.parse(req.body)
  const result = await sendContactMessage({ ...input, email: input.email.toLowerCase() })
  logger.info('contact.received', { ok: result.ok })
  res.json({ message: 'Thanks for reaching out — we’ll be in touch shortly.' })
})
