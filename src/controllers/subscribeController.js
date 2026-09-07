import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { sendSubscribe } from '../lib/notifier.js'
import { logger } from '../lib/logger.js'

const subscribeSchema = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
})

// POST /api/subscribe — public. Records a newsletter subscriber via the
// Apps Script web app (which appends to a Google Sheet and sends a welcome
// mail). We always respond 200 with a friendly message so the form never
// leaks whether an address is already on the list.
export const subscribe = asyncHandler(async (req, res) => {
  const { email, name } = subscribeSchema.parse(req.body)
  const result = await sendSubscribe({ email: email.toLowerCase(), name })
  logger.info('subscribe.requested', { ok: result.ok })
  res.json({ message: 'Thanks for subscribing — please check your inbox.' })
})
