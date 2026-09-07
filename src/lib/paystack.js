// Paystack integration (server-side). Uses the global fetch available in
// Node 18+. If PAYSTACK_SECRET_KEY is not set, initialize/verify run in a
// simulated mode so the API is fully testable without real credentials.

import crypto from 'node:crypto'
import { config } from '../config.js'
import { logger } from './logger.js'

const BASE = 'https://api.paystack.co'
const enabled = Boolean(config.paystack.secretKey)

export const PAYSTACK_ENABLED = enabled

async function call(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.paystack.secretKey}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body?.message || `Paystack error (${res.status})`)
  }
  return body
}

// Initialize a transaction. amountNaira is in Naira; Paystack expects kobo.
export async function initializeTransaction({ email, amountNaira, reference, metadata }) {
  if (!enabled) {
    logger.warn('paystack.simulated_init', { reference })
    return {
      simulated: true,
      authorization_url: `${config.paystack.callbackUrl || 'http://localhost:5173'}?reference=${reference}&simulated=1`,
      access_code: 'sim_access',
      reference,
    }
  }
  const body = await call('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email,
      amount: Math.round(amountNaira * 100),
      reference,
      callback_url: config.paystack.callbackUrl || undefined,
      metadata,
    }),
  })
  return body.data
}

export async function verifyTransaction(reference) {
  if (!enabled) {
    // In simulated mode, treat every verify as a success.
    logger.warn('paystack.simulated_verify', { reference })
    return { status: 'success', reference, simulated: true }
  }
  const body = await call(`/transaction/verify/${encodeURIComponent(reference)}`)
  return {
    status: body.data?.status, // 'success' | 'failed' | ...
    reference: body.data?.reference,
    amount: body.data?.amount != null ? body.data.amount / 100 : undefined,
    raw: body.data,
  }
}

// Verify the x-paystack-signature header on webhook calls.
// `rawBody` must be the exact raw request buffer/string.
export function verifyWebhookSignature(rawBody, signature) {
  if (!enabled) return true // simulated mode: accept
  if (!signature) return false
  const hash = crypto
    .createHmac('sha512', config.paystack.secretKey)
    .update(rawBody)
    .digest('hex')
  // Constant-time compare.
  const a = Buffer.from(hash)
  const b = Buffer.from(signature)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
