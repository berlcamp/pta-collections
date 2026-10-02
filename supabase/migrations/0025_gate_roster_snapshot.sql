-- 0025_gate_roster_snapshot.sql
-- Let a gate read its own school's roster, so it can put a name on the screen
-- the moment a card taps -- including while the internet is down.
--
-- ---------------------------------------------------------------------------
-- 1. WHY THE GATE NOW READS AT ALL
-- ---------------------------------------------------------------------------
-- Until now the device was write-only: 0013 gave the anon key one append-only
-- verb, record_attendance(), and no SELECT on anything. The gate is moving from
-- the ESP32 to a mini PC with a monitor (esp32 repo,
-- docs/superpowers/specs/2026-09-19-linux-gate-migration-design.md), and that
-- monitor shows the student's name, number, grade and section on every tap.
-- Resolving a card to a name locally needs a local copy of the roster, so the
-- gate needs to read one.
--
-- It reads through ONE function returning ONE school's snapshot. anon still
-- holds no table privileges whatsoever; 0013's rule survives intact.
--
-- ---------------------------------------------------------------------------
-- 2. WHY A DEVICE ID IS NOT ENOUGH HERE
-- ---------------------------------------------------------------------------
-- record_attendance() trusts a request on its device_id alone. That is
-- tolerable for a write: the worst a stranger can do is append rows that
-- name a card, which is noise, not a leak. Neither half of that pair is
-- secret -- device ids are short readable names like 'onhs-main-gate', and the
-- anon key is the shared project's PUBLIC key, shipped to every browser that
-- loads construction-saas or sms-demo.
--
-- A read is different. Authorised the same way, this function would hand a
-- whole school's names, student numbers and CARD UIDS to anyone who guessed a
-- device name. The cards are 125 kHz EM tags, which copy in seconds on a
-- cheap cloner, so a leaked uid is a forged attendance tap and a Telegram
-- message to a real parent.
--
-- So each device gets a SECRET. issue_gate_device_token() mints one, returns
-- it exactly once, and stores only its SHA-256. The mini PC keeps it in
-- /etc/gate/gate.env (mode 0600). A stolen mini PC still leaks one school's
-- roster -- that is accepted in the design -- but nothing short of the box
-- itself does.
--
-- Plain SHA-256, not bcrypt: the token is 240+ random bits, not a password a
-- person chose, so there is no dictionary to slow down. sha256() is core
-- Postgres; like 0013, this keeps no dependency on pgcrypto.
--
-- record_attendance() is deliberately left alone. Requiring the token there
-- too is the right follow-up, but it would break the installed ESP32 the day
-- this is applied, and the ESP32 is the rollback for this very migration.
--
-- ---------------------------------------------------------------------------
-- 3. WHAT THE SNAPSHOT CONTAINS
-- ---------------------------------------------------------------------------
-- Exactly what the screen shows, and nothing it does not: pta.gate_roster's
-- name, student number, grade and section, plus the active cards of the
-- students on it. No guardians, no Telegram ids, no fees. A card held by a
-- student who is not on this year's roster is left out -- the screen would
-- have nothing to show for it, and attendance_resolved still resolves the
-- tap server-side whatever the screen said.
--
-- It is one jsonb document rather than two calls so the students and cards
-- are read in one statement: a card can never arrive pointing at a student
-- the same snapshot does not contain.
--
-- Apply by hand in the SQL Editor, in order, like every other migration here.
-- Never `supabase db push`: the project is shared with construction-saas and
-- sms-demo.

-- ---------------------------------------------------------------------------
-- gate_devices.token_hash
--
-- Null means no token has been issued, and such a device cannot read the
-- roster -- which is every device that exists today, including the ESP32,
-- which never needs to.
-- ---------------------------------------------------------------------------

alter table pta.gate_devices
  add column if not exists token_hash      text,
  add column if not exists token_issued_at timestamptz;

alter table pta.gate_devices
  drop constraint if exists gate_devices_token_hash_format;
alter table pta.gate_devices
  add constraint gate_devices_token_hash_format
  check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$');

comment on column pta.gate_devices.token_hash is
  'SHA-256 (hex) of the device''s roster-read secret. The secret itself is '
  'shown once by pta.issue_gate_device_token() and never stored.';

-- One definition of the hash, used by both functions below, so the issuing
-- side and the checking side cannot drift apart.
create or replace function pta.gate_token_hash(p_token text)
returns text
language sql
immutable
strict
as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

-- ---------------------------------------------------------------------------
-- issue_gate_device_token(device_id) -> text
--
-- Mints a new secret and returns it ONCE. Issuing again replaces the old one,
-- which is how a token is rotated -- and how a stolen mini PC is shut out
-- without deactivating the device id its past attendance rows point at.
--
-- Admin-only, the same gate assign_student_card() uses. Audited, because who
-- can read a school's roster is a decision someone made.
-- ---------------------------------------------------------------------------

create or replace function pta.issue_gate_device_token(p_device_id text)
returns text
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  v_school   uuid;
  v_token    text;
  v_replaced boolean;
begin
  select school_id, token_hash is not null
    into v_school, v_replaced
    from pta.gate_devices
   where device_id = p_device_id;
  if not found then
    raise exception 'no such gate device: %', p_device_id using errcode = '23503';
  end if;

  perform pta.require_school_role(v_school, array['admin']);

  -- Two v4 UUIDs: 244 random bits, the same no-pgcrypto source 0013's enrol
  -- tokens use. The prefix makes a leaked one recognisable in a log or a paste.
  v_token := 'gt_' || replace(gen_random_uuid()::text, '-', '')
                   || replace(gen_random_uuid()::text, '-', '');

  update pta.gate_devices
     set token_hash      = pta.gate_token_hash(v_token),
         token_issued_at = now()
   where device_id = p_device_id;

  -- entity_id is a uuid and a device is keyed by text, so the id rides in
  -- new_values. The token itself never touches the audit log.
  perform pta.write_audit(
    v_school, 'GATE_DEVICE_TOKEN_ISSUED', 'gate_device', null,
    null,
    jsonb_build_object('device_id', p_device_id, 'replaced', v_replaced)
  );

  return v_token;
end;
$$;

-- ---------------------------------------------------------------------------
-- gate_roster_snapshot(device_id, token) -> jsonb
--
--   { "school_id": uuid, "device_id": text, "generated_at": timestamptz,
--     "students": [ { student_id, full_name, student_no, grade_level,
--                     section_name } ],
--     "cards":    [ { card_uid, student_id } ] }
--
-- A wrong token, an unknown device, an inactive device and a device with no
-- token all raise the SAME error. Telling them apart would let a caller
-- enumerate which device names exist.
-- ---------------------------------------------------------------------------

create or replace function pta.gate_roster_snapshot(
  p_device_id text,
  p_token     text
) returns jsonb
language plpgsql
stable
security definer
set search_path = pta, public, pg_temp
as $$
declare
  v_school uuid;
begin
  select g.school_id
    into v_school
    from pta.gate_devices g
   where g.device_id  = p_device_id
     and g.active
     and g.token_hash is not null
     and g.token_hash = pta.gate_token_hash(coalesce(p_token, ''));

  if v_school is null then
    raise exception 'invalid gate device credentials' using errcode = '42501';
  end if;

  return (
    with roster as (
      select r.student_id, r.full_name, r.student_no, r.grade_level, r.section_name
        from pta.gate_roster r
       where r.school_id = v_school
    )
    select jsonb_build_object(
      'school_id',    v_school,
      'device_id',    p_device_id,
      'generated_at', now(),
      'students', coalesce((
        select jsonb_agg(to_jsonb(roster) order by roster.full_name)
          from roster
      ), '[]'::jsonb),
      'cards', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'card_uid',   c.card_uid,
                 'student_id', c.student_id
               ) order by c.card_uid)
          from pta.student_cards c
          join roster on roster.student_id = c.student_id
         where c.school_id  = v_school
           and c.revoked_at is null
      ), '[]'::jsonb)
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Definer functions must not be callable by the public role.
-- ---------------------------------------------------------------------------

revoke all on function pta.gate_token_hash(text)                 from public;
revoke all on function pta.issue_gate_device_token(text)         from public;
revoke all on function pta.gate_roster_snapshot(text, text)      from public;

-- Staff mint tokens through the RLS-bound client; the function checks admin.
grant execute on function pta.issue_gate_device_token(text)      to authenticated;

-- The device's anon key gets its SECOND verb. Unlike the first, this one is
-- useless without a secret that lives only on the device.
grant execute on function pta.gate_roster_snapshot(text, text)   to anon;
