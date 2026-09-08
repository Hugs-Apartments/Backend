// Centralised, environment-based config. No secrets are hardcoded — everything
// comes from process.env (loaded from .env in dev via dotenv).

import 'dotenv/config'

function required(name) {
  const v = process.env[name]
  if (!v && process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required env var: ${name}`)
  }
  return v ?? ''
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  supabase: {
    url: required('SUPABASE_URL'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  },

  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-insecure-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },

  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY ?? '',
    callbackUrl: process.env.PAYSTACK_CALLBACK_URL ?? '',
  },

  // Google Apps Script web app used to send booking emails (with a PDF
  // receipt) and to record newsletter subscribers. The token is a shared
  // secret checked on the Apps Script side.
  appsScript: {
    url: process.env.APPS_SCRIPT_URL ?? '',
    token: process.env.APPS_SCRIPT_TOKEN ?? '',
  },

  business: {
    name: process.env.BUSINESS_NAME ?? 'Hugs Luxury Apartments',
    email: process.env.BUSINESS_EMAIL ?? 'stay@hugsapartments.ng',
    whatsapp: process.env.BUSINESS_WHATSAPP ?? '+234 909 215 7050',
    phone: process.env.BUSINESS_PHONE ?? '+234 909 215 7050',
    address: process.env.BUSINESS_ADDRESS ?? '45 Dokun Ogundipe Crescent, Maryland, Lagos, Nigeria',
    instagram: process.env.BUSINESS_INSTAGRAM ?? 'https://www.instagram.com/hugsluxuryapartments',
  },

  // Public site URL, used to build guest-facing links (e.g. the post-stay
  // feedback page). No trailing slash.
  publicUrl: (process.env.PUBLIC_URL ?? process.env.FRONTEND_URL ?? '').replace(/\/$/, ''),

  // Shared secret for scheduled jobs (e.g. the feedback-email dispatch). Vercel
  // Cron sends this automatically as `Authorization: Bearer <CRON_SECRET>`.
  cronSecret: process.env.CRON_SECRET ?? '',

  serviceFeeRate: Number(process.env.SERVICE_FEE_RATE ?? 0.05),
}

export const isProd = config.env === 'production'
