// Server-side Supabase client using the SERVICE ROLE key.
// This key bypasses row-level security, so it must NEVER be exposed to the
// browser. Only import this from backend code.

import { createClient } from '@supabase/supabase-js'
import { config } from '../config.js'

export const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  },
)
