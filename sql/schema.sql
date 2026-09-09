-- Hugs Luxury Apartments — database schema (PostgreSQL / Supabase)
-- Run in the Supabase SQL editor, or via `psql < sql/schema.sql`.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type property_type as enum ('Studio', '1-Bedroom', '2-Bedroom', 'Penthouse');
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking_status as enum ('pending', 'confirmed', 'cancelled', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('pending', 'success', 'failed', 'refunded');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Admin users
-- ---------------------------------------------------------------------------
create table if not exists admin_users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  password_hash text not null,
  name          text not null,
  role          text not null default 'admin',   -- 'admin' | 'superadmin'
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Properties / listings
-- ---------------------------------------------------------------------------
create table if not exists properties (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  type            property_type not null,
  description     text not null default '',
  price_per_night numeric(12,2) not null check (price_per_night >= 0),
  max_guests      int not null default 1 check (max_guests > 0),
  amenities       text[] not null default '{}',
  images          text[] not null default '{}',
  location        text not null default 'Maryland, Lagos',
  area            text,
  map_url         text,
  rating          numeric(2,1) not null default 5.0,
  review_count    int not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_properties_active on properties (is_active);

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create table if not exists bookings (
  id             uuid primary key default gen_random_uuid(),
  reference      text unique not null,
  property_id    uuid not null references properties (id) on delete restrict,
  guest_name     text not null,
  guest_email    text not null,
  guest_phone    text not null,
  notes          text,
  check_in       date not null,
  check_out      date not null,
  guests         int not null default 1 check (guests > 0),
  nights         int not null,
  subtotal       numeric(12,2) not null,
  service_fee    numeric(12,2) not null default 0,
  discount_code   text,
  discount_amount numeric(12,2) not null default 0,
  total_amount   numeric(12,2) not null,
  status         booking_status not null default 'pending',
  payment_status payment_status not null default 'pending',
  -- Post-stay feedback tracking (see feedback table + cron dispatch)
  feedback_requested_at timestamptz,
  feedback_submitted_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (check_out > check_in)
);

create index if not exists idx_bookings_property on bookings (property_id);
create index if not exists idx_bookings_status on bookings (status);
create index if not exists idx_bookings_dates on bookings (check_in, check_out);

-- ---------------------------------------------------------------------------
-- Blocked dates (manual admin blocks — maintenance, owner use, etc.)
-- ---------------------------------------------------------------------------
create table if not exists blocked_dates (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties (id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  reason      text,
  created_at  timestamptz not null default now(),
  check (end_date > start_date)
);

create index if not exists idx_blocked_property on blocked_dates (property_id);

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create table if not exists payments (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references bookings (id) on delete cascade,
  provider     text not null default 'paystack',
  reference    text unique not null,
  amount       numeric(12,2) not null,
  status       payment_status not null default 'pending',
  raw_response jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_payments_booking on payments (booking_id);

-- ---------------------------------------------------------------------------
-- Newsletter subscribers
-- ---------------------------------------------------------------------------
create table if not exists subscribers (
  id         uuid primary key default gen_random_uuid(),
  email      text unique not null,
  name       text,
  created_at timestamptz not null default now()
);

create index if not exists idx_subscribers_created on subscribers (created_at desc);

-- ---------------------------------------------------------------------------
-- Promo / discount codes (created by admins, applied at booking time)
-- ---------------------------------------------------------------------------
create table if not exists promo_codes (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,                                    -- stored UPPERCASE
  type        text not null default 'percent' check (type in ('percent', 'fixed')),
  value       numeric(12,2) not null check (value >= 0),               -- percent: 0-100, fixed: ₦ off
  active      boolean not null default true,
  max_uses    int,                                                     -- null = unlimited
  used_count  int not null default 0,
  min_nights  int not null default 0,
  starts_on   date,                                                    -- null = no start bound
  expires_on  date,                                                    -- null = never expires
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_promo_codes_active on promo_codes (active);

-- ---------------------------------------------------------------------------
-- Guest feedback (collected after checkout — does NOT change a listing's rating)
-- ---------------------------------------------------------------------------
create table if not exists feedback (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid references bookings (id) on delete set null,
  property_id uuid references properties (id) on delete set null,
  reference   text,
  guest_name  text not null,
  guest_email text,
  rating      int not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_feedback_property on feedback (property_id);
create index if not exists idx_feedback_created on feedback (created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$ begin
  create trigger trg_properties_updated before update on properties
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_bookings_updated before update on bookings
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_payments_updated before update on payments
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_promo_codes_updated before update on promo_codes
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;
