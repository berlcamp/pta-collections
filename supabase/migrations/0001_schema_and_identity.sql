-- 0001_schema_and_identity.sql
-- PTA Collection Management System — schema bootstrap, identity, tenancy.
--
-- SHARED SUPABASE PROJECT (lvcbmopdstvupjpytjbb): also hosts construction-saas
-- and sms-demo. Everything here lives in `pta`. Nothing is created in `public`
-- and NOTHING is attached to auth.users. See CLAUDE.md.

create schema if not exists pta;

grant usage on schema pta to anon, authenticated, service_role;

alter default privileges in schema pta
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema pta
  grant usage, select on sequences to authenticated;

-- pg_trgm backs the gin_trgm_ops indexes in 0002/0003. On the shared project
-- it is already installed in `public` (pre-existing — another app or the
-- dashboard toggle put it there). Leave it there: ALTER EXTENSION ... SET
-- SCHEMA would invalidate the other apps' trgm indexes. IF NOT EXISTS makes
-- this a no-op in production; it is here so a local `db reset` still works.
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function pta.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Normalizes a person's name for duplicate matching: lowercase, collapse
-- whitespace, strip punctuation. Used by the CSV importer (guardian matching).
create or replace function pta.normalize_name(p_name text)
returns text
language sql
immutable
as $$
  select nullif(trim(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', ' ', 'g')), '');
$$;

-- Normalizes a PH mobile number to 09XXXXXXXXX where possible.
create or replace function pta.normalize_contact(p_contact text)
returns text
language sql
immutable
as $$
  with digits as (
    select regexp_replace(coalesce(p_contact, ''), '[^0-9]', '', 'g') as d
  )
  select case
    when d = '' then null
    when length(d) = 11 and d like '09%' then d
    when length(d) = 12 and d like '639%' then '0' || substring(d from 3)
    when length(d) = 13 and d like '0639%' then '0' || substring(d from 4)
    when length(d) = 10 and d like '9%' then '0' || d
    else d
  end
  from digits;
$$;

-- ---------------------------------------------------------------------------
-- profiles  (D6: decoupled from auth.users)
--
-- The primary key is our own uuid, NOT auth.users.id. Another app on this shared
-- project deleting a user must not erase the identity attached to a 2026 receipt.
-- auth_user_id is nullable so that (a) the super-admin bootstrap row can exist
-- before its first sign-in and (b) local seed data needs no auth users at all.
-- ---------------------------------------------------------------------------

create table pta.profiles (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique references auth.users(id) on delete set null,
  email         text not null unique,
  full_name     text not null,
  avatar_url    text,
  global_role   text not null default 'user'
                  check (global_role in ('super_admin', 'user')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_email_lowercase check (email = lower(email))
);

create index profiles_auth_user_id_idx on pta.profiles (auth_user_id);

create trigger profiles_set_updated_at
  before update on pta.profiles
  for each row execute function pta.set_updated_at();

-- ---------------------------------------------------------------------------
-- schools
-- ---------------------------------------------------------------------------

create table pta.schools (
  id                  uuid primary key default gen_random_uuid(),
  school_code         text not null unique,
  name                text not null,
  short_name          text,
  address             text,
  city                text,
  province            text,
  region              text,
  contact_number      text,
  email               text,
  logo_url            text,
  receipt_prefix      text not null
                        check (receipt_prefix ~ '^[A-Z0-9]{2,10}$'),
  receipt_footer_text text,
  timezone            text not null default 'Asia/Manila',
  active              boolean not null default true,
  created_by          uuid references pta.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index schools_active_idx on pta.schools (active);

create trigger schools_set_updated_at
  before update on pta.schools
  for each row execute function pta.set_updated_at();

-- Per-school key/value for the long tail only. Stable configuration that renders
-- onto financial documents lives in typed columns on pta.schools above.
create table pta.school_settings (
  school_id  uuid not null references pta.schools(id) on delete cascade,
  key        text not null,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (school_id, key)
);

-- ---------------------------------------------------------------------------
-- Membership and invitations  (D4/D5: invite-first, no auth.users trigger)
-- ---------------------------------------------------------------------------

create table pta.school_users (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references pta.schools(id) on delete cascade,
  profile_id uuid not null references pta.profiles(id) on delete cascade,
  role       text not null check (role in ('admin', 'cashier', 'treasurer', 'viewer')),
  status     text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references pta.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, profile_id)
);

create index school_users_profile_idx on pta.school_users (profile_id, status);
create index school_users_school_idx on pta.school_users (school_id, status);

create trigger school_users_set_updated_at
  before update on pta.school_users
  for each row execute function pta.set_updated_at();

create table pta.school_user_invites (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references pta.schools(id) on delete cascade,
  email      text not null,
  full_name  text not null,
  role       text not null check (role in ('admin', 'cashier', 'treasurer', 'viewer')),
  status     text not null default 'pending'
               check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null default (now() + interval '30 days'),
  invited_by uuid references pta.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invites_email_lowercase check (email = lower(email))
);

-- Only one live invite per (school, email); accepted/revoked ones may accumulate.
create unique index school_user_invites_pending_idx
  on pta.school_user_invites (school_id, email)
  where status = 'pending';

create index school_user_invites_email_idx on pta.school_user_invites (email, status);

create trigger school_user_invites_set_updated_at
  before update on pta.school_user_invites
  for each row execute function pta.set_updated_at();
