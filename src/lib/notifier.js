// Thin client for the Google Apps Script web app that sends booking emails
// (with a PDF receipt attached) and records newsletter subscribers.
//
// If APPS_SCRIPT_URL is not configured, calls are logged and skipped so the
// rest of the flow (payment confirmation) is never blocked by email delivery.

import { config } from '../config.js'
import { logger } from './logger.js'

const { url, token } = config.appsScript

async function post(action, payload) {
  if (!url) {
    logger.warn('notifier.skipped', { action, reason: 'APPS_SCRIPT_URL not set' })
    return { ok: false, skipped: true }
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token, ...payload }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.ok === false) {
      logger.error('notifier.failed', { action, status: res.status, error: data.error })
      return { ok: false, error: data.error ?? `HTTP ${res.status}` }
    }
    logger.info('notifier.sent', { action })
    return { ok: true, ...data }
  } catch (err) {
    // Never throw — email failure must not roll back a confirmed payment.
    logger.error('notifier.error', { action, error: err.message })
    return { ok: false, error: err.message }
  }
}

// Sends the guest a booking-confirmed email with a PDF receipt. `receipt` is
// the object built by buildReceipt(); `payment` carries the transaction info.
export function sendBookingConfirmation({ receipt, payment }) {
  return post('booking_confirmed', {
    business: config.business,
    receipt,
    payment,
  })
}

// Records a newsletter subscriber.
export function sendSubscribe({ email, name }) {
  return post('subscribe', { email, name: name ?? '' })
}

// Relays a contact-form enquiry. The Apps Script emails the business inbox and
// sends the sender an acknowledgement copy.
export function sendContactMessage({ name, email, phone, message }) {
  return post('contact', {
    business: config.business,
    contact: { name, email, phone: phone ?? '', message },
  })
}

// Sends a post-checkout thank-you + feedback request. `feedbackUrl` is the
// public page where the guest can leave a rating and comment.
export function sendFeedbackRequest({ name, email, reference, propertyName, feedbackUrl }) {
  return post('feedback_request', {
    business: config.business,
    guest: { name: name ?? '', email },
    booking: { reference: reference ?? '', property_name: propertyName ?? '' },
    feedback_url: feedbackUrl ?? '',
  })
}
