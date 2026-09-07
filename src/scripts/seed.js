// Seed script: creates a superadmin and a few sample properties.
// Usage:  node src/scripts/seed.js
// Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env, and optionally
// SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD.

import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@hugsapartments.ng'
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!'

const CORE = ['24/7 Security', 'Power Supply', 'High-Speed WiFi', 'Ample Parking', 'Clean Water Supply']
const img = (s) => `https://picsum.photos/seed/${s}/1200/800`

const PROPERTIES = [
  {
    name: 'The Plum Suite', type: 'Studio', area: 'Mende', price_per_night: 85000, max_guests: 2,
    rating: 4.9, review_count: 128,
    amenities: [...CORE, 'Smart TV', 'Air Conditioning', 'Kitchenette'],
    images: [img('hugs1a'), img('hugs1b'), img('hugs1c')],
    description: 'A warm, light-filled studio designed for couples and solo travellers.',
  },
  {
    name: 'Champagne One-Bedroom', type: '1-Bedroom', area: 'Mende', price_per_night: 120000, max_guests: 3,
    rating: 4.8, review_count: 96,
    amenities: [...CORE, 'Smart TV', 'Air Conditioning', 'Full Kitchen', 'Workspace'],
    images: [img('hugs2a'), img('hugs2b'), img('hugs2c')],
    description: 'An elegant one-bedroom retreat with a full kitchen and dedicated workspace.',
  },
  {
    name: 'The Gold Two-Bedroom', type: '2-Bedroom', area: 'Anthony', price_per_night: 180000, max_guests: 5,
    rating: 5.0, review_count: 74,
    amenities: [...CORE, 'Smart TV', 'Air Conditioning', 'Full Kitchen', 'Washer', 'Balcony'],
    images: [img('hugs3a'), img('hugs3b'), img('hugs3c')],
    description: 'Spacious two-bedroom apartment with warm-toned interiors and a private balcony.',
  },
  {
    name: 'Maryland Penthouse', type: 'Penthouse', area: 'Ikorodu Road', price_per_night: 350000, max_guests: 6,
    rating: 5.0, review_count: 52,
    amenities: [...CORE, 'Smart TV', 'Air Conditioning', 'Full Kitchen', 'Washer', 'Private Balcony', 'City View', 'Concierge'],
    images: [img('hugs4a'), img('hugs4b'), img('hugs4c')],
    description: 'Our signature penthouse — floor-to-ceiling views and concierge service.',
  },
]

async function run() {
  // Admin
  const password_hash = await bcrypt.hash(ADMIN_PASSWORD, 12)
  const { error: aErr } = await supabaseAdmin.from('admin_users').upsert(
    { email: ADMIN_EMAIL.toLowerCase(), password_hash, name: 'Hugs Admin', role: 'superadmin' },
    { onConflict: 'email' },
  )
  if (aErr) throw aErr
  console.log(`✓ Superadmin ready: ${ADMIN_EMAIL} (password: ${ADMIN_PASSWORD})`)

  // Properties (skip if any exist)
  const { count } = await supabaseAdmin
    .from('properties')
    .select('id', { count: 'exact', head: true })
  if (count && count > 0) {
    console.log(`• ${count} properties already exist — skipping property seed.`)
  } else {
    const { error: pErr } = await supabaseAdmin.from('properties').insert(PROPERTIES)
    if (pErr) throw pErr
    console.log(`✓ Inserted ${PROPERTIES.length} sample properties.`)
  }

  console.log('\nSeed complete. Remember to change the admin password.')
  process.exit(0)
}

run().catch((e) => {
  console.error('Seed failed:', e.message)
  process.exit(1)
})
