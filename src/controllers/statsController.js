import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { asyncHandler } from '../middleware/errorHandler.js'

// GET /api/stats/overview — admin dashboard metrics.
export const getOverview = asyncHandler(async (req, res) => {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const todayISO = now.toISOString().slice(0, 10)

  const [
    { data: monthBookings, error: e1 },
    { count: activeProps, error: e2 },
    { data: upcoming, error: e3 },
    { data: recent, error: e4 },
  ] = await Promise.all([
    supabaseAdmin
      .from('bookings')
      .select('total_amount, status, payment_status, created_at')
      .gte('created_at', monthStart),
    supabaseAdmin
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
    supabaseAdmin
      .from('bookings')
      .select('id, reference, guest_name, check_in, check_out, property:properties(name)')
      .eq('status', 'confirmed')
      .gte('check_in', todayISO)
      .order('check_in', { ascending: true })
      .limit(10),
    supabaseAdmin
      .from('bookings')
      .select('id, reference, guest_name, total_amount, status, payment_status, created_at, property:properties(name)')
      .order('created_at', { ascending: false })
      .limit(10),
  ])
  if (e1) throw e1
  if (e2) throw e2
  if (e3) throw e3
  if (e4) throw e4

  const revenueThisMonth = (monthBookings ?? [])
    .filter((b) => b.payment_status === 'success')
    .reduce((sum, b) => sum + Number(b.total_amount), 0)

  const bookingsThisMonth = (monthBookings ?? []).length

  res.json({
    metrics: {
      bookings_this_month: bookingsThisMonth,
      revenue_this_month: revenueThisMonth,
      active_properties: activeProps ?? 0,
      upcoming_count: (upcoming ?? []).length,
    },
    upcoming_checkins: upcoming ?? [],
    recent_bookings: recent ?? [],
  })
})

// GET /api/stats/revenue?days=30 — daily revenue series for the chart.
export const getRevenueSeries = asyncHandler(async (req, res) => {
  const days = Math.min(90, Math.max(7, Number(req.query.days) || 30))
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceISO = since.toISOString()

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select('total_amount, payment_status, created_at')
    .gte('created_at', sinceISO)
    .eq('payment_status', 'success')
  if (error) throw error

  // Bucket by day.
  const buckets = {}
  for (let i = 0; i < days; i++) {
    const d = new Date()
    d.setDate(d.getDate() - (days - 1 - i))
    buckets[d.toISOString().slice(0, 10)] = 0
  }
  for (const b of data ?? []) {
    const key = new Date(b.created_at).toISOString().slice(0, 10)
    if (key in buckets) buckets[key] += Number(b.total_amount)
  }

  const series = Object.entries(buckets).map(([date, revenue]) => ({ date, revenue }))
  res.json({ series })
})
