-- 0013_gate_attendance.sql
-- RFID attendance gate — the ESP32 school-gate reader, folded into `pta`.
--
-- WHY THIS EXISTS
-- The gate used to own a parallel schema, `mvts_esp32`, with its own students
-- and its own guardians. A student enrolled in PTA Collections was invisible at
-- the gate until somebody retyped them, and a card tap resolved against a roster
-- nobody maintained. This migration makes `pta` the single source of identity:
-- cards point at pta.students, Telegram identity lives on pta.parents_guardians,
-- and every gate row is school-scoped like everything else here.
--
-- TENANCY. The device knows one string: its DEVICE_ID. pta.gate_devices maps
-- that to a school, and pta.record_attendance() stamps school_id from there. A
-- device cannot claim to be at a school it is not registered to, because it never
-- sends a school_id at all.
--
-- ---------------------------------------------------------------------------
-- TWO DELIBERATE EXCEPTIONS TO THIS PROJECT'S RULES. Both are load-bearing.
-- ---------------------------------------------------------------------------
--
-- 1. `anon` gets exactly one EXECUTE grant: pta.record_attendance().
--    0006_rls_policies.sql ends with `revoke all ... from anon`, and that stays
--    true for every table. But the gate device holds the anon key in flash, and
--    flash is readable over USB in about 30 seconds. So it gets one append-only
--    verb and NO table privileges whatsoever -- not even SELECT.
--
--    Why not PostgREST's upsert instead? Its ignore-duplicates mode compiles to
--    ON CONFLICT (event_id) DO NOTHING, and Postgres requires SELECT on the
--    table to infer that conflict target. Granting SELECT on pta.attendance to
--    anon would put every student's movements one permissive policy away from a
--    key that is printed inside a device screwed to a wall.
--
-- 2. `service_role` gains SELECT on the tenant read surface (students,
--    enrollments, guardians, ...). Before this, `pta` granted service_role
--    nothing. The gate dashboard reads with service_role, which BYPASSES RLS --
--    so the dashboard is responsible for scoping every query by school_id. It
--    does that by resolving GATE_DEVICE_ID -> pta.gate_devices.school_id once
--    and filtering on it (web/lib/supabase.ts in the esp32 repo). Giving that
--    dashboard real staff auth, and dropping this grant, is the follow-up.
--
-- Apply by hand in the SQL Editor, in order, like every other migration here.
-- Never `supabase db push`: the project is shared with construction-saas and
-- sms-demo.

-- ---------------------------------------------------------------------------
-- Shared helper: one place that decides how a person's name is rendered.
-- Used by the gate views and by redeem_enroll_token(). Distinct from
-- pta.normalize_name(), which is a MATCH key for the CSV importer, not a label.
-- ---------------------------------------------------------------------------

create or replace function pta.display_name(
  p_last text, p_first text, p_middle text default null, p_suffix text default null
)
returns text
language sql
immutable
as $$
  select btrim(coalesce(p_last, '') || ', ' || coalesce(p_first, ''))
       || coalesce(' ' || nullif(btrim(coalesce(p_middle, '')), ''), '')
       || coalesce(' ' || nullif(btrim(coalesce(p_suffix, '')), ''), '');
$$;

-- ---------------------------------------------------------------------------
-- Additive changes to existing tables.
-- ---------------------------------------------------------------------------

-- Lets student_cards and guardian_enroll_tokens carry a COMPOSITE foreign key
-- (student_id, school_id). Without it, a card row could name school A while its
-- student belongs to school B and nothing would object. id is already unique, so
-- this constraint costs an index and forbids nothing that was previously legal.
alter table pta.students
  add constraint students_id_school_key unique (id, school_id);

-- Telegram identity. It lives on the guardian rather than in a side table
-- because it IS an identity attribute of that person -- like contact_number,
-- which is already here.
alter table pta.parents_guardians
  add column if not exists telegram_chat_id   text,
  add column if not exists telegram_active    boolean not null default true,
  add column if not exists telegram_linked_at timestamptz;

-- Per-school, NOT global. D8 duplicates a parent across schools on purpose, so
-- one Telegram account legitimately maps to one guardian row PER SCHOOL. A
-- global unique index here would reject the second school's row and quietly
-- break enrolment for a parent with children at two schools in this system.
create unique index if not exists guardians_telegram_idx
  on pta.parents_guardians (school_id, telegram_chat_id)
  where telegram_chat_id is not null;

-- The opt-out that consent paperwork promises, and that /stop in the bot sets.
alter table pta.student_guardians
  add column if not exists notify boolean not null default true;

-- ---------------------------------------------------------------------------
-- gate_devices — the tenancy anchor
--
-- One row per physical reader. This is the ONLY thing that turns a device's
-- self-reported DEVICE_ID into a school, so an unregistered device is rejected
-- outright rather than writing rows nobody can attribute.
-- ---------------------------------------------------------------------------

create table pta.gate_devices (
  device_id  text primary key,
  school_id  uuid not null references pta.schools(id) on delete cascade,
  label      text,
  active     boolean not null default true,
  created_by uuid references pta.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gate_devices_id_format check (device_id ~ '^[a-z0-9][a-z0-9._-]{1,62}$')
);

create index gate_devices_school_idx on pta.gate_devices (school_id, active);

create trigger gate_devices_set_updated_at
  before update on pta.gate_devices
  for each row execute function pta.set_updated_at();

-- ---------------------------------------------------------------------------
-- student_cards
--
-- A card UID is NOT a column on students, because cards get lost and reissued.
-- Keeping issue/revoke history means a scan resolves to whoever held that card
-- AT THAT MOMENT, so reissuing a card never silently rewrites past attendance.
-- ---------------------------------------------------------------------------

create table pta.student_cards (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references pta.schools(id) on delete cascade,
  student_id uuid not null,
  card_uid   text not null,
  issued_at  timestamptz not null default now(),
  revoked_at timestamptz,
  created_by uuid references pta.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Composite: the card and the student must belong to the same school.
  constraint student_cards_student_fk
    foreign key (student_id, school_id) references pta.students (id, school_id)
    on delete cascade,
  -- Uppercase hex is what the Wiegand decoder emits and what the dashboard
  -- normalises to. Enforcing it here means a hand-typed uid cannot silently
  -- fail to match its own scans.
  constraint student_cards_uid_format check (card_uid ~ '^[0-9A-F]{4,32}$'),
  constraint student_cards_revoke_order check (revoked_at is null or revoked_at >= issued_at)
);

create index student_cards_lookup_idx
  on pta.student_cards (school_id, card_uid, issued_at desc);
create index student_cards_student_idx on pta.student_cards (student_id);

-- At most one ACTIVE holder per physical card, per school. Two schools may
-- legitimately issue the same cheap card UID; one school may not.
create unique index student_cards_active_uid_idx
  on pta.student_cards (school_id, card_uid)
  where revoked_at is null;

create trigger student_cards_set_updated_at
  before update on pta.student_cards
  for each row execute function pta.set_updated_at();

-- ---------------------------------------------------------------------------
-- attendance
--
-- One row = "a card passed the gate". NOT "a student was present" -- with a
-- single reader that is a rule the app applies, not something measured here.
--
-- Three columns exist so the record can be honest about itself:
--   scanned_at   the DEVICE's claim
--   received_at  when the server actually saw it
--   clock_synced false = the device had no NTP yet and this time was
--                reconstructed from boot_epoch + uptime
-- ---------------------------------------------------------------------------

create table pta.attendance (
  event_id     uuid primary key,          -- device-generated idempotency key
  school_id    uuid not null references pta.schools(id) on delete cascade,
  device_id    text not null references pta.gate_devices(device_id),
  card_uid     text not null,
  scanned_at   timestamptz not null,
  received_at  timestamptz not null default now(),
  clock_synced boolean not null default false,
  direction    text not null default 'in' check (direction in ('in', 'out')),
  queued       boolean not null default false,  -- true = arrived after an outage
  -- Storage path of the gate capture. Nullable forever: the uploader gives up
  -- on the image rather than let a failed upload hold back the attendance row.
  image_path   text
);

create index attendance_school_time_idx on pta.attendance (school_id, scanned_at desc);
create index attendance_card_time_idx   on pta.attendance (school_id, card_uid, scanned_at desc);
create index attendance_capture_idx     on pta.attendance (received_at) where image_path is not null;

-- ---------------------------------------------------------------------------
-- gate_notify_config — per school, one row
--
-- The staleness rule lives HERE and nowhere else, so the Edge Function stays
-- dumb: it sends what it is told to send.
--
-- Why a staleness rule at all: the device is built to survive a three-hour
-- outage and then flush. Without this, 200 events land at 4pm and 200 parents
-- are told their child "has arrived" for a 7am arrival. Every one of those
-- messages costs credibility, and nobody is helped by them.
-- ---------------------------------------------------------------------------

create table pta.gate_notify_config (
  school_id              uuid primary key references pta.schools(id) on delete cascade,
  enabled                boolean not null default true,
  -- delay <= fresh_within_s                     -> send normally
  -- fresh_within_s < delay <= suppress_after_s  -> send, worded as delayed
  -- delay > suppress_after_s                    -> record as suppressed, send nothing
  fresh_within_s         integer not null default 900,    -- 15 min
  suppress_after_s       integer not null default 7200,   -- 2 h
  capture_retention_days integer not null default 30,
  updated_at             timestamptz not null default now(),
  constraint gate_notify_config_thresholds
    check (fresh_within_s >= 0 and suppress_after_s >= fresh_within_s),
  constraint gate_notify_config_retention check (capture_retention_days > 0)
);

create trigger gate_notify_config_set_updated_at
  before update on pta.gate_notify_config
  for each row execute function pta.set_updated_at();

-- ---------------------------------------------------------------------------
-- gate_notifications
--
-- The composite primary key is the whole point. record_attendance() already
-- makes a replayed batch a no-op; this makes a replayed FAN-OUT a no-op. A
-- duplicate attendance row is invisible. A duplicate "Ana arrived at school"
-- at 11pm is how parents stop trusting the system.
-- ---------------------------------------------------------------------------

create table pta.gate_notifications (
  event_id       uuid not null references pta.attendance(event_id) on delete cascade,
  guardian_id    uuid not null references pta.parents_guardians(id) on delete cascade,
  school_id      uuid not null references pta.schools(id) on delete cascade,
  -- 'sending' is set when an attempt STARTS, not when it is queued, so a
  -- notifier that dies mid-send leaves a row that times out and is retried
  -- rather than one that looks pending forever.
  status         text not null default 'sending'
                   check (status in ('sending', 'sent', 'failed', 'suppressed')),
  delivery_class text not null default 'fresh'
                   check (delivery_class in ('fresh', 'delayed', 'stale')),
  delay_s        integer not null default 0,
  -- Incremented when an attempt BEGINS. Bounding retries matters: Telegram
  -- charges nothing, but a wedged row retried forever is a wedged row.
  attempts       integer not null default 0,
  sent_at        timestamptz,
  error          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (event_id, guardian_id)
);

create index gate_notifications_unfinished_idx
  on pta.gate_notifications (updated_at)
  where status in ('sending', 'failed');

-- ---------------------------------------------------------------------------
-- guardian_enroll_tokens
--
-- A Telegram bot CANNOT start a conversation -- the API answers "Forbidden:
-- bot can't initiate conversation with a user". The guardian must message the
-- bot first. So the enrolment slip carries a QR for
--   https://t.me/<YourSchoolBot>?start=<token>
-- One tap, no typing, no support call. Single use, and it expires.
-- ---------------------------------------------------------------------------

create table pta.guardian_enroll_tokens (
  token        text primary key,
  school_id    uuid not null references pta.schools(id) on delete cascade,
  student_id   uuid not null,
  relationship text not null default 'Guardian'
                 check (relationship in ('Mother', 'Father', 'Grandparent',
                                         'Legal Guardian', 'Sibling', 'Guardian', 'Other')),
  expires_at   timestamptz not null,
  used_at      timestamptz,
  guardian_id  uuid references pta.parents_guardians(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint guardian_enroll_tokens_student_fk
    foreign key (student_id, school_id) references pta.students (id, school_id)
    on delete cascade
);

create index guardian_enroll_tokens_student_idx
  on pta.guardian_enroll_tokens (student_id);

-- ---------------------------------------------------------------------------
-- attendance_resolved
--
-- Resolves each scan to the student who held that card AT SCAN TIME, and to the
-- student number they carried in the school year the scan falls in -- so last
-- year's scans keep last year's number rather than being retconned by this
-- year's enrolment. Unknown cards come back with a null student, which is what
-- the /enroll page lists as "unassigned".
-- ---------------------------------------------------------------------------

create or replace view pta.attendance_resolved
with (security_invoker = on) as
select
  a.event_id,
  a.school_id,
  a.card_uid,
  a.device_id,
  a.scanned_at,
  a.received_at,
  a.clock_synced,
  a.direction,
  a.queued,
  a.image_path,
  s.id as student_id,
  case when s.id is null then null
       else pta.display_name(s.last_name, s.first_name, s.middle_name, s.suffix)
  end as full_name,
  coalesce(e.student_number, s.lrn) as student_no,
  e.grade_level,
  e.section_name
from pta.attendance a
left join pta.student_cards c
       on c.school_id = a.school_id
      and c.card_uid  = a.card_uid
      and a.scanned_at >= c.issued_at
      and (c.revoked_at is null or a.scanned_at < c.revoked_at)
left join pta.students s
       on s.id = c.student_id
-- LATERAL, not a plain join: nothing forbids two pta.school_years rows from
-- overlapping, and a plain join would then emit the same scan twice and inflate
-- every count on the dashboard. This picks exactly one.
left join lateral (
  select en.student_number, en.grade_level, sec.name as section_name
    from pta.student_enrollments en
    join pta.school_years sy on sy.id = en.school_year_id
    left join pta.sections sec on sec.id = en.section_id
   where en.student_id = s.id
     and en.school_id  = a.school_id
     and a.scanned_at >= sy.start_date::timestamptz
     and a.scanned_at <  (sy.end_date + 1)::timestamptz
   order by sy.start_date desc
   limit 1
) e on true;

-- ---------------------------------------------------------------------------
-- gate_roster — who the board expects to see today
--
-- Students actively enrolled in their school's ACTIVE school year. The unique
-- index school_years_one_active_idx guarantees at most one such year per
-- school, so this cannot duplicate a student.
-- ---------------------------------------------------------------------------

create or replace view pta.gate_roster
with (security_invoker = on) as
select
  s.school_id,
  s.id as student_id,
  pta.display_name(s.last_name, s.first_name, s.middle_name, s.suffix) as full_name,
  coalesce(en.student_number, s.lrn) as student_no,
  en.grade_level,
  sec.name as section_name,
  sy.id    as school_year_id
from pta.students s
join pta.school_years sy
  on sy.school_id = s.school_id and sy.is_active
join pta.student_enrollments en
  on en.student_id = s.id and en.school_year_id = sy.id
left join pta.sections sec on sec.id = en.section_id
where s.status = 'active'
  and en.status = 'enrolled';

-- ---------------------------------------------------------------------------
-- RLS. Enabled AND FORCED, same as every other table in `pta` (0006).
--
-- Policy shape follows this project's existing split:
--   * Tenant reads:      school_id = any (pta.current_school_ids())
--   * Config writes:     pta.has_school_role(school_id, array['admin'])
--   * Machine-written:   NO write policy at all. attendance,
--     gate_notifications and guardian_enroll_tokens are written only by the
--     SECURITY DEFINER functions below -- exactly as payments is (D3).
--
-- There is no `using (true)` in this file.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'gate_devices', 'student_cards', 'attendance',
    'gate_notify_config', 'gate_notifications', 'guardian_enroll_tokens'
  ] loop
    execute format('alter table pta.%I enable row level security', t);
    execute format('alter table pta.%I force row level security', t);
  end loop;
end $$;

create policy gate_devices_read on pta.gate_devices for select to authenticated
using (school_id = any (pta.current_school_ids()));

create policy gate_devices_admin_write on pta.gate_devices for all to authenticated
using (pta.has_school_role(school_id, array['admin']))
with check (pta.has_school_role(school_id, array['admin']));

create policy student_cards_read on pta.student_cards for select to authenticated
using (school_id = any (pta.current_school_ids()));

-- Card enrolment is an admin act: it decides whose attendance a tap becomes.
create policy student_cards_admin_write on pta.student_cards for all to authenticated
using (pta.has_school_role(school_id, array['admin']))
with check (pta.has_school_role(school_id, array['admin']));

-- Read-only through RLS. Deliberately NO insert/update/delete policy: rows come
-- from pta.record_attendance() and nowhere else. If you find yourself wanting a
-- write policy here, you want an RPC instead.
create policy attendance_read on pta.attendance for select to authenticated
using (school_id = any (pta.current_school_ids()));

create policy gate_notify_config_read on pta.gate_notify_config for select to authenticated
using (school_id = any (pta.current_school_ids()));

create policy gate_notify_config_admin_write on pta.gate_notify_config for all to authenticated
using (pta.has_school_role(school_id, array['admin']))
with check (pta.has_school_role(school_id, array['admin']));

-- Delivery records: readable by the tenant, written only by the notifier RPCs.
create policy gate_notifications_read on pta.gate_notifications for select to authenticated
using (school_id = any (pta.current_school_ids()));

-- Tokens are bearer credentials printed on paper. Readable by the tenant so an
-- admin can see who has been issued one and whether it was redeemed; issued and
-- redeemed only by the RPCs.
create policy guardian_enroll_tokens_read on pta.guardian_enroll_tokens for select to authenticated
using (school_id = any (pta.current_school_ids()));

-- ---------------------------------------------------------------------------
-- record_attendance(events jsonb) -> integer
--
-- The ONLY thing the gate device can do. Idempotent batch append.
--
-- A crash between "Postgres inserted" and "the device saved its cursor"
-- re-sends the batch, which is harmless: event_id is a client-generated UUID
-- and the primary key, so ON CONFLICT DO NOTHING makes the retry a no-op. The
-- return value is how many rows were actually new.
-- ---------------------------------------------------------------------------

create or replace function pta.record_attendance(events jsonb)
returns integer
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  v_inserted integer;
  v_unknown  text;
begin
  if jsonb_typeof(events) <> 'array' then
    raise exception 'events must be a JSON array' using errcode = '22023';
  end if;

  -- Bound the batch so a stolen anon key cannot post a 100MB array.
  if jsonb_array_length(events) > 200 then
    raise exception 'batch too large (max 200)' using errcode = '54000';
  end if;

  -- An unregistered device is an ERROR, not a silent skip. The device is built
  -- to queue through anything it cannot deliver, so raising here means the
  -- events sit safely on flash until someone registers the device -- whereas
  -- skipping them would destroy them and report success.
  select string_agg(distinct d.device_id, ', ')
    into v_unknown
    from (select e->>'device_id' as device_id from jsonb_array_elements(events) e) d
   where d.device_id is not null
     and not exists (
       select 1 from pta.gate_devices g
        where g.device_id = d.device_id and g.active
     );

  if v_unknown is not null then
    raise exception 'unregistered or inactive gate device: %', v_unknown
      using errcode = '42501';
  end if;

  insert into pta.attendance (
    event_id, school_id, device_id, card_uid, scanned_at,
    clock_synced, direction, queued, image_path
  )
  select
    (e->>'event_id')::uuid,
    g.school_id,                       -- stamped from the device registry,
    g.device_id,                       -- never from the request body
    upper(e->>'card_uid'),
    (e->>'scanned_at')::timestamptz,
    coalesce((e->>'clock_synced')::boolean, false),
    coalesce(nullif(e->>'direction', ''), 'in'),
    coalesce((e->>'queued')::boolean, false),
    -- Null is not an error: the uploader gives up on the image rather than let
    -- a failed upload hold back the attendance row.
    nullif(e->>'image_path', '')
  from jsonb_array_elements(events) as e
  join pta.gate_devices g on g.device_id = e->>'device_id'
  where e->>'event_id'  is not null
    and e->>'card_uid'  is not null
    and e->>'scanned_at' is not null
  on conflict (event_id) do nothing;   -- retries are no-ops, never duplicates

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_notifications(event_id)
--
-- Called by the notifier once per attendance insert. Decides who should be
-- told, applies the staleness rule, and reserves the work in one statement.
--
-- Returns ONLY rows it newly inserted. A webhook that fires twice therefore
-- returns zero rows the second time and nothing is sent again -- the same
-- ON CONFLICT DO NOTHING trick record_attendance() uses, moved from rows
-- written to messages sent.
-- ---------------------------------------------------------------------------

create or replace function pta.claim_notifications(p_event_id uuid)
returns table (
  guardian_id    uuid,
  chat_id        text,
  guardian_name  text,
  student_name   text,
  student_no     text,
  scanned_at     timestamptz,
  image_path     text,
  clock_synced   boolean,
  delivery_class text,
  delay_s        integer
)
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
-- RETURNS TABLE names (guardian_id, ...) are plpgsql variables, and ON
-- CONFLICT's column list cannot be table-qualified -- so without this the
-- insert below fails with "column reference guardian_id is ambiguous". Every
-- genuine variable read here is a v_/p_/cfg./ev. name, so preferring the
-- column is unambiguous.
#variable_conflict use_column
declare
  cfg     pta.gate_notify_config%rowtype;
  ev      record;
  v_delay integer;
  v_class text;
begin
  select r.* into ev
    from pta.attendance_resolved r
   where r.event_id = p_event_id;

  -- Unknown card, or the event vanished. Nothing to send; the dashboard
  -- already surfaces unknown scans.
  if not found or ev.student_id is null then
    return;
  end if;

  select * into cfg
    from pta.gate_notify_config
   where school_id = ev.school_id;

  if not found or not cfg.enabled then
    return;
  end if;

  v_delay := greatest(0, floor(extract(epoch from (ev.received_at - ev.scanned_at)))::integer);

  v_class := case
    when v_delay <= cfg.fresh_within_s   then 'fresh'
    when v_delay <= cfg.suppress_after_s then 'delayed'
    else 'stale'
  end;

  return query
  with recipients as (
    select g.id as gid,
           g.telegram_chat_id,
           pta.display_name(g.last_name, g.first_name, g.middle_name, g.suffix) as gname
      from pta.student_guardians sg
      join pta.parents_guardians g on g.id = sg.guardian_id
     where sg.student_id = ev.student_id
       and sg.school_id  = ev.school_id
       and sg.notify
       and g.telegram_active
       and g.telegram_chat_id is not null
  ),
  claimed as (
    insert into pta.gate_notifications
      (event_id, guardian_id, school_id, status, delivery_class, delay_s, attempts)
    select p_event_id, r.gid, ev.school_id,
           case when v_class = 'stale' then 'suppressed' else 'sending' end,
           v_class, v_delay,
           case when v_class = 'stale' then 0 else 1 end
      from recipients r
    on conflict (event_id, guardian_id) do nothing
    returning gate_notifications.guardian_id
  )
  select r.gid, r.telegram_chat_id, r.gname,
         ev.full_name, ev.student_no, ev.scanned_at, ev.image_path,
         ev.clock_synced, v_class, v_delay
    from claimed c
    join recipients r on r.gid = c.guardian_id
   -- A stale event is RECORDED above (so the dashboard can show it was
   -- suppressed) but the caller is handed nothing to send.
   where v_class <> 'stale';
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_notification(...)
--
-- 'blocked' is not a status: Telegram reporting that the user blocked the bot
-- clears telegram_active on the guardian instead, so we stop burning retries on
-- a recipient who has opted out at their end. Note it clears the TELEGRAM flag
-- only -- the guardian remains a guardian for every other purpose in this app.
-- ---------------------------------------------------------------------------

create or replace function pta.mark_notification(
  p_event_id    uuid,
  p_guardian_id uuid,
  p_status      text,
  p_error       text default null,
  p_deactivate  boolean default false
) returns void
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
begin
  if p_status not in ('sending', 'sent', 'failed', 'suppressed') then
    raise exception 'bad status %', p_status using errcode = '22023';
  end if;

  -- attempts is NOT touched here: it is incremented when an attempt BEGINS, in
  -- claim_notifications() and retry_notifications(). Counting on completion
  -- would let a notifier that crashes mid-send retry without limit.
  update pta.gate_notifications
     set status     = p_status,
         error      = p_error,
         updated_at = now(),
         sent_at    = case when p_status = 'sent' then now() else sent_at end
   where event_id = p_event_id and guardian_id = p_guardian_id;

  if p_deactivate then
    update pta.parents_guardians
       set telegram_active = false
     where id = p_guardian_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- retry_notifications(...)
--
-- The sweeper, and the only way a stuck row ever moves again:
-- claim_notifications() will never hand the same (event_id, guardian_id) out
-- twice, because the conflict target is already taken.
--
-- Two things it must get right:
--
--   FOR UPDATE SKIP LOCKED -- two overlapping cron ticks must not both grab the
--   same row and message the parent twice.
--
--   Re-scoring staleness -- a row that has been failing for four hours must not
--   finally go out claiming the gate was "20 minutes late". It is re-measured
--   against now(), and if it has aged past suppress_after_s it is marked
--   suppressed and never sent.
--
-- Schedule with pg_cron:
--
--   select cron.schedule('gate-notify-retry', '*/5 * * * *', $c$
--     select net.http_post(
--       url     := 'https://<ref>.supabase.co/functions/v1/notify-guardian',
--       headers := '{"Content-Type":"application/json",
--                    "x-webhook-secret":"<WEBHOOK_SECRET>"}'::jsonb,
--       body    := '{"mode":"retry"}'::jsonb)
--   $c$);
-- ---------------------------------------------------------------------------

create or replace function pta.retry_notifications(
  p_older_than_s integer default 120,
  p_max_attempts integer default 5,
  p_limit        integer default 100
)
returns table (
  event_id       uuid,
  guardian_id    uuid,
  chat_id        text,
  guardian_name  text,
  student_name   text,
  student_no     text,
  scanned_at     timestamptz,
  image_path     text,
  clock_synced   boolean,
  delivery_class text,
  delay_s        integer
)
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $fn$
-- Same shadowing hazard as claim_notifications(): the RETURNS TABLE names
-- collide with the columns this statement updates.
#variable_conflict use_column
begin
  return query
  with due as (
    select n.event_id, n.guardian_id, n.school_id
      from pta.gate_notifications n
      join pta.parents_guardians g
        on g.id = n.guardian_id
       and g.telegram_active
       and g.telegram_chat_id is not null
      join pta.gate_notify_config c
        on c.school_id = n.school_id and c.enabled
     where n.status in ('sending', 'failed')
       and n.attempts < p_max_attempts
       and n.updated_at < now() - make_interval(secs => p_older_than_s)
     order by n.updated_at
     limit p_limit
     for update of n skip locked
  ),
  rescored as (
    select d.event_id, d.guardian_id,
           c.fresh_within_s, c.suppress_after_s,
           greatest(0, floor(extract(epoch from (now() - a.scanned_at)))::integer) as new_delay
      from due d
      join pta.attendance a          on a.event_id  = d.event_id
      join pta.gate_notify_config c  on c.school_id = d.school_id
  ),
  claimed as (
    update pta.gate_notifications n
       set status = case
                      when rs.new_delay > rs.suppress_after_s then 'suppressed'
                      else 'sending'
                    end,
           delivery_class = case
                      when rs.new_delay > rs.suppress_after_s then 'stale'
                      when rs.new_delay <= rs.fresh_within_s  then 'fresh'
                      else 'delayed'
                    end,
           delay_s    = rs.new_delay,
           attempts   = n.attempts + 1,
           updated_at = now()
      from rescored rs
     where n.event_id = rs.event_id and n.guardian_id = rs.guardian_id
    returning n.event_id, n.guardian_id, n.status, n.delivery_class, n.delay_s
  )
  select c.event_id, c.guardian_id, g.telegram_chat_id,
         pta.display_name(g.last_name, g.first_name, g.middle_name, g.suffix),
         r.full_name, r.student_no, r.scanned_at, r.image_path,
         r.clock_synced, c.delivery_class, c.delay_s
    from claimed c
    join pta.parents_guardians g   on g.id = c.guardian_id
    join pta.attendance_resolved r on r.event_id = c.event_id
   -- Rows just aged out are recorded as suppressed above and handed to nobody.
   where c.status = 'sending';
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Guardian enrolment. issue -> print QR -> guardian taps -> redeem.
-- ---------------------------------------------------------------------------

create or replace function pta.issue_enroll_token(
  p_student_id   uuid,
  p_relationship text default 'Guardian',
  p_valid_for    interval default interval '30 days'
) returns text
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  v_token  text;
  v_school uuid;
begin
  select school_id into v_school from pta.students where id = p_student_id;
  if not found then
    raise exception 'no such student: %', p_student_id using errcode = '23503';
  end if;

  -- 122 bits of randomness, and no pgcrypto dependency.
  v_token := replace(gen_random_uuid()::text, '-', '');

  insert into pta.guardian_enroll_tokens
    (token, school_id, student_id, relationship, expires_at)
  values
    (v_token, v_school, p_student_id, coalesce(p_relationship, 'Guardian'), now() + p_valid_for);

  return v_token;
end;
$$;

-- redeem_enroll_token(token, chat_id, display_name)
--
-- Finds or creates the guardian WITHIN THE TOKEN'S SCHOOL. Scoping to the token
-- is what stops a chat_id linked at school A from being silently reused as an
-- identity at school B.
create or replace function pta.redeem_enroll_token(
  p_token        text,
  p_chat_id      text,
  p_display_name text
) returns jsonb
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  tok        record;
  v_guardian uuid;
  v_student  record;
  v_name     text;
  v_first    text;
  v_last     text;
begin
  select * into tok
    from pta.guardian_enroll_tokens
   where token = p_token
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_token');
  end if;
  if tok.used_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_used');
  end if;
  if tok.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  -- Telegram gives one display string; this table wants first and last. Split
  -- on the final space, and fall back to putting the whole thing in both rather
  -- than rejecting a one-word name.
  v_name  := coalesce(nullif(btrim(p_display_name), ''), 'Guardian');
  v_last  := coalesce((regexp_match(v_name, '(\S+)$'))[1], v_name);
  v_first := coalesce(nullif(btrim(regexp_replace(v_name, '\s+\S+$', '')), ''), v_name);

  -- Same person, second child: reuse the guardian row keyed on chat_id.
  select id into v_guardian
    from pta.parents_guardians
   where school_id = tok.school_id
     and telegram_chat_id = p_chat_id;

  if v_guardian is null then
    insert into pta.parents_guardians
      (school_id, first_name, last_name, telegram_chat_id, telegram_active, telegram_linked_at)
    values
      (tok.school_id, v_first, v_last, p_chat_id, true, now())
    returning id into v_guardian;
  else
    update pta.parents_guardians
       set telegram_active    = true,
           telegram_linked_at = coalesce(telegram_linked_at, now())
     where id = v_guardian;
  end if;

  insert into pta.student_guardians
    (school_id, student_id, guardian_id, relationship, notify)
  values
    (tok.school_id, tok.student_id, v_guardian, tok.relationship, true)
  on conflict (student_id, guardian_id) do update set notify = true;

  update pta.guardian_enroll_tokens
     set used_at = now(), guardian_id = v_guardian
   where token = p_token;

  select pta.display_name(s.last_name, s.first_name, s.middle_name, s.suffix) as full_name,
         r.student_no
    into v_student
    from pta.students s
    left join pta.gate_roster r on r.student_id = s.id
   where s.id = tok.student_id;

  return jsonb_build_object(
    'ok', true,
    'guardian_id',  v_guardian,
    'student_name', v_student.full_name,
    'student_no',   v_student.student_no
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- set_notify_preference(chat_id, on)
--
-- Backs /stop and /resume in the bot. A guardian who mutes the bot at their end
-- is invisible to us; one who tells us to stop should be recorded, because
-- consent paperwork promised an opt-out that actually does something.
--
-- A chat_id can be linked at more than one school (D8 duplicates a parent), and
-- "stop messaging me" means all of them.
-- ---------------------------------------------------------------------------

create or replace function pta.set_notify_preference(
  p_chat_id text,
  p_on      boolean
) returns jsonb
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  v_count integer;
begin
  if not exists (
    select 1 from pta.parents_guardians where telegram_chat_id = p_chat_id
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_linked');
  end if;

  update pta.student_guardians sg
     set notify = p_on
    from pta.parents_guardians g
   where g.id = sg.guardian_id
     and g.telegram_chat_id = p_chat_id;
  get diagnostics v_count = row_count;

  -- /resume also clears a block flag set by a previous failed send.
  update pta.parents_guardians
     set telegram_active = true
   where telegram_chat_id = p_chat_id;

  return jsonb_build_object('ok', true, 'students', v_count);
end;
$$;

-- ---------------------------------------------------------------------------
-- Capture retention. Attendance rows are kept forever; photographs of minors
-- are not. SQL cannot delete the underlying Storage object, so this only NAMES
-- the paths -- the purge job calls the Storage API with them, then clears
-- image_path via forget_capture().
-- ---------------------------------------------------------------------------

create or replace function pta.expired_captures(p_limit integer default 500)
returns table (event_id uuid, image_path text)
language sql
security definer
set search_path = pta, public, pg_temp
as $$
  select a.event_id, a.image_path
    from pta.attendance a
    join pta.gate_notify_config c on c.school_id = a.school_id
   where a.image_path is not null
     and a.received_at < now() - make_interval(days => c.capture_retention_days)
   order by a.received_at
   limit p_limit;
$$;

create or replace function pta.forget_capture(p_event_id uuid)
returns void
language sql
security definer
set search_path = pta, public, pg_temp
as $$
  update pta.attendance set image_path = null where event_id = p_event_id;
$$;

-- ---------------------------------------------------------------------------
-- Grants. RLS is the gate; grants are the outer door.
-- ---------------------------------------------------------------------------

-- Staff, through the RLS-bound user client. (0001 sets default privileges for
-- `authenticated` in this schema; these are explicit for the same reason 0006's
-- closing grants are.)
grant select, insert, update, delete on
  pta.gate_devices, pta.student_cards, pta.gate_notify_config
to authenticated;

grant select on
  pta.attendance, pta.gate_notifications, pta.guardian_enroll_tokens,
  pta.attendance_resolved, pta.gate_roster
to authenticated;

-- anon gets NOTHING on any table. See the header.
revoke all on
  pta.gate_devices, pta.student_cards, pta.attendance, pta.gate_notify_config,
  pta.gate_notifications, pta.guardian_enroll_tokens,
  pta.attendance_resolved, pta.gate_roster
from anon;

-- service_role: the gate dashboard and the two Edge Functions. This role
-- BYPASSES RLS -- the dashboard is what scopes reads to one school. See the
-- header, exception 2.
grant select, insert, update, delete on
  pta.gate_devices, pta.student_cards, pta.attendance, pta.gate_notify_config,
  pta.gate_notifications, pta.guardian_enroll_tokens
to service_role;

grant select on
  pta.schools, pta.school_years, pta.sections, pta.grade_levels,
  pta.students, pta.student_enrollments,
  pta.parents_guardians, pta.student_guardians,
  pta.attendance_resolved, pta.gate_roster
to service_role;

-- The notifier needs to flip telegram_active / telegram_linked_at, and
-- redeem_enroll_token() creates guardian rows. Those go through the definer
-- functions above, but the Edge Function also updates nothing directly -- these
-- two grants exist so a future admin tool on service_role is not blocked.
grant update (telegram_chat_id, telegram_active, telegram_linked_at)
  on pta.parents_guardians to service_role;
grant update (notify) on pta.student_guardians to service_role;

-- Definer functions must not be callable by the public role.
revoke all on function pta.record_attendance(jsonb)                             from public;
revoke all on function pta.claim_notifications(uuid)                            from public;
revoke all on function pta.mark_notification(uuid, uuid, text, text, boolean)   from public;
revoke all on function pta.retry_notifications(integer, integer, integer)       from public;
revoke all on function pta.issue_enroll_token(uuid, text, interval)             from public;
revoke all on function pta.redeem_enroll_token(text, text, text)                from public;
revoke all on function pta.set_notify_preference(text, boolean)                 from public;
revoke all on function pta.expired_captures(integer)                            from public;
revoke all on function pta.forget_capture(uuid)                                 from public;

-- THE exception: one append-only verb for the device's anon key.
grant execute on function pta.record_attendance(jsonb) to anon, authenticated, service_role;

-- Everything else is server-side only.
grant execute on function pta.claim_notifications(uuid)                          to service_role;
grant execute on function pta.mark_notification(uuid, uuid, text, text, boolean) to service_role;
grant execute on function pta.retry_notifications(integer, integer, integer)     to service_role;
grant execute on function pta.issue_enroll_token(uuid, text, interval)           to service_role, authenticated;
grant execute on function pta.redeem_enroll_token(text, text, text)              to service_role;
grant execute on function pta.set_notify_preference(text, boolean)               to service_role;
grant execute on function pta.expired_captures(integer)                          to service_role;
grant execute on function pta.forget_capture(uuid)                               to service_role;

-- ---------------------------------------------------------------------------
-- Storage: the private bucket the gate uploads captures to.
--
-- storage.objects is SHARED with construction-saas and sms-demo. No policy is
-- added here at all: the bucket is private and only service_role (which
-- bypasses RLS) reads it, minting a short-lived signed URL per Telegram message.
-- If you ever add a policy for it, scope it `bucket_id = 'gate-captures'`.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('gate-captures', 'gate-captures', false)
on conflict (id) do nothing;
