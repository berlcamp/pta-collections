-- 0015_gate_admin.sql
-- The gate, seen from PTA Collections.
--
-- WHY THIS EXISTS
-- 0013 gave the ESP32 gate everything it needs to WRITE: a device registry, an
-- append-only verb, and a resolved view its own dashboard reads with
-- service_role. What it never got was a way for a person sitting in this app to
-- watch the gate or to hand a piece of plastic to a student. That is what this
-- migration adds, and it adds it the way this project does everything else:
--
--   * Reads go through views with security_invoker, so RLS decides what the
--     caller sees. Nothing here is granted to service_role or to anon.
--   * The day boundary is computed HERE, in the school's timezone (D11) --
--     v_attendance_local is to attendance what v_payments_local is to payments.
--   * The one write, binding a card to a student, is a SECURITY DEFINER RPC.
--     0013 left student_cards as an ordinary RLS table write and the gate board
--     does revoke-then-insert as two round trips; a crash between them leaves a
--     student with no card and the school none the wiser. assign_student_card()
--     makes it one statement pair in one transaction, and writes an audit row,
--     because "whose attendance does this tap become" is an identity decision.
--
-- Apply by hand in the SQL Editor, in order, like every other migration here.
-- Never `supabase db push`: the project is shared with construction-saas and
-- sms-demo.

-- ---------------------------------------------------------------------------
-- v_attendance_local — resolved scans with the school-local calendar date (D11)
--
-- "Today's scans" must mean the same day the treasurer's reports mean. A gate
-- tap at 07:05 Manila is 23:05 the previous day in UTC, so bucketing scanned_at
-- in the browser would show an empty board every morning until 08:00.
-- ---------------------------------------------------------------------------

create or replace view pta.v_attendance_local
with (security_invoker = on) as
select
  r.*,
  (r.scanned_at at time zone s.timezone)::date                     as local_date,
  date_trunc('month', r.scanned_at at time zone s.timezone)::date  as local_month,
  s.timezone                                                       as school_timezone
from pta.attendance_resolved r
join pta.schools s on s.id = r.school_id;

-- ---------------------------------------------------------------------------
-- v_gate_device_status — is the reader alive?
--
-- The board's first question is never "who arrived", it is "is the thing at the
-- gate still talking to us". A device that has been silent since 06:40 is the
-- headline, because every other number on the page is then a lie of omission.
--
-- last_scan_at is the device's claim; last_received_at is when the server
-- actually saw it. They diverge by exactly the length of the last outage, which
-- is the number worth showing.
-- ---------------------------------------------------------------------------

create or replace view pta.v_gate_device_status
with (security_invoker = on) as
select
  d.device_id,
  d.school_id,
  d.label,
  d.active,
  d.created_at,
  last.scanned_at            as last_scan_at,
  last.received_at           as last_received_at,
  coalesce(today.scans, 0)   as scans_today
from pta.gate_devices d
join pta.schools s on s.id = d.school_id
-- school_id leads attendance_school_time_idx, so both of these walk the index
-- rather than the table. device_id alone would not.
left join lateral (
  select a.scanned_at, a.received_at
    from pta.attendance a
   where a.school_id = d.school_id
     and a.device_id = d.device_id
   order by a.scanned_at desc
   limit 1
) last on true
left join lateral (
  select count(*) as scans
    from pta.attendance a
   where a.school_id = d.school_id
     and a.device_id = d.device_id
     and a.scanned_at >= (date_trunc('day', now() at time zone s.timezone)
                            at time zone s.timezone)
) today on true;

-- ---------------------------------------------------------------------------
-- v_unassigned_cards — plastic that has been tapped but belongs to nobody
--
-- The enrolment queue. One row per card UID seen at this school that NO active
-- student_cards row currently holds, newest tap first.
--
-- The `not exists` is doing real work: a card issued today has scans from
-- BEFORE it was issued, and those scans resolve to a null student in
-- attendance_resolved. Filtering on "the scan had no student" would put every
-- freshly enrolled card straight back on the queue. Filtering on "no one holds
-- this card NOW" is the question actually being asked.
--
-- Synthetic UIDs are excluded. The device firmware's `burst n` console command
-- mints B0000001-style ids to load-test the upload queue; they are not cards,
-- nobody will ever enrol them, and left in they bury the real queue. The gate
-- board applies the same filter (web/app/api/enroll/route.ts in the esp32 repo).
-- ---------------------------------------------------------------------------

create or replace view pta.v_unassigned_cards
with (security_invoker = on) as
select
  a.school_id,
  a.card_uid,
  count(*)          as scan_count,
  min(a.scanned_at) as first_seen_at,
  max(a.scanned_at) as last_seen_at,
  (array_agg(a.device_id order by a.scanned_at desc))[1] as last_device_id
from pta.attendance a
where a.card_uid !~ '^B[0-9]{7}$'
  and not exists (
    select 1
      from pta.student_cards c
     where c.school_id  = a.school_id
       and c.card_uid   = a.card_uid
       and c.revoked_at is null
  )
group by a.school_id, a.card_uid;

-- ---------------------------------------------------------------------------
-- v_student_cards_detail — issued cards, with the person attached
--
-- student_cards holds ids. A person revoking a lost card needs a name, a
-- section, and "last used" so they can tell a genuinely lost card from one that
-- was simply left at home. Joined here rather than in TypeScript because
-- PostgREST relationship inference THROUGH a view fails by returning nulls
-- instead of erroring (see lib/data/hydrate.ts).
--
-- The gate_roster join is LEFT: a card belonging to a student who has since
-- graduated still has to be visible, precisely so it can be revoked.
-- ---------------------------------------------------------------------------

create or replace view pta.v_student_cards_detail
with (security_invoker = on) as
select
  c.id,
  c.school_id,
  c.student_id,
  c.card_uid,
  c.issued_at,
  c.revoked_at,
  c.created_at,
  pta.display_name(s.last_name, s.first_name, s.middle_name, s.suffix) as student_name,
  coalesce(r.student_no, s.lrn) as student_no,
  r.grade_level,
  r.section_name,
  -- attendance_card_time_idx is (school_id, card_uid, scanned_at desc), so this
  -- is one index hit per row.
  (select max(a.scanned_at)
     from pta.attendance a
    where a.school_id = c.school_id
      and a.card_uid  = c.card_uid) as last_used_at
from pta.student_cards c
join pta.students s on s.id = c.student_id
left join pta.gate_roster r
       on r.student_id = c.student_id
      and r.school_id  = c.school_id;

-- ---------------------------------------------------------------------------
-- assign_student_card(student_id, card_uid) -> uuid
--
-- Bind a physical card to a student. Retires whoever held that card before, in
-- the same transaction, and returns the new card row's id.
--
-- Retiring rather than UPDATEing the old row is what keeps history honest: past
-- attendance still resolves to whoever actually held the card that day
-- (attendance_resolved joins on the issue/revoke window). An UPDATE would
-- silently rewrite last term's arrivals to name the new holder.
--
-- The school is taken from the STUDENT, never from the caller. A card cannot be
-- pointed at another school's student even by a super admin with a typo,
-- because the composite FK on student_cards would refuse the row anyway -- this
-- just turns that into a sentence a person can read.
-- ---------------------------------------------------------------------------

create or replace function pta.assign_student_card(
  p_student_id uuid,
  p_card_uid   text
) returns uuid
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  v_school   uuid;
  v_uid      text;
  v_card_id  uuid;
  v_previous uuid;
begin
  select school_id into v_school from pta.students where id = p_student_id;
  if not found then
    raise exception 'no such student: %', p_student_id using errcode = '23503';
  end if;

  -- Same gate every other admin verb uses. A super admin passes for any active
  -- school (0005), and acting_as_super_admin() records that in the audit row.
  perform pta.require_school_role(v_school, array['admin']);

  -- Uppercase hex is what the Wiegand decoder emits and what student_cards has
  -- a CHECK for. Normalising here means a hand-typed uid still matches its own
  -- scans instead of failing a constraint the typist cannot see.
  v_uid := upper(btrim(coalesce(p_card_uid, '')));
  if v_uid !~ '^[0-9A-F]{4,32}$' then
    raise exception 'card uid must be 4-32 hexadecimal characters, got %', p_card_uid
      using errcode = '22023';
  end if;

  -- Already bound to this very student: nothing to do, and re-issuing would
  -- reset issued_at and orphan the interval its own scans fall in.
  select id into v_card_id
    from pta.student_cards
   where school_id  = v_school
     and card_uid   = v_uid
     and student_id = p_student_id
     and revoked_at is null;
  if found then
    return v_card_id;
  end if;

  -- At most one active holder per card (student_cards_active_uid_idx). Stand
  -- the incumbent down first rather than colliding with that index.
  update pta.student_cards
     set revoked_at = now()
   where school_id  = v_school
     and card_uid   = v_uid
     and revoked_at is null
  returning student_id into v_previous;

  insert into pta.student_cards (school_id, student_id, card_uid, created_by)
  values (v_school, p_student_id, v_uid, pta.current_profile_id())
  returning id into v_card_id;

  perform pta.write_audit(
    v_school, 'CARD_ASSIGNED', 'student_card', v_card_id,
    case when v_previous is null then null
         else jsonb_build_object('previous_student_id', v_previous)
    end,
    jsonb_build_object(
      'card_uid',   v_uid,
      'student_id', p_student_id,
      'reassigned', v_previous is not null
    )
  );

  return v_card_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- revoke_student_card(card_id) -> void
--
-- Lost, broken, or the student left. Revoking stops future taps resolving to
-- them WITHOUT touching a single past attendance row.
-- ---------------------------------------------------------------------------

create or replace function pta.revoke_student_card(p_card_id uuid)
returns void
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  card pta.student_cards%rowtype;
begin
  select * into card from pta.student_cards where id = p_card_id;
  if not found then
    raise exception 'no such card: %', p_card_id using errcode = '23503';
  end if;

  perform pta.require_school_role(card.school_id, array['admin']);

  if card.revoked_at is not null then
    return;   -- idempotent: a double-click is not an error
  end if;

  update pta.student_cards set revoked_at = now() where id = p_card_id;

  perform pta.write_audit(
    card.school_id, 'CARD_REVOKED', 'student_card', p_card_id,
    jsonb_build_object('card_uid', card.card_uid, 'student_id', card.student_id),
    jsonb_build_object('revoked_at', now())
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants.
--
-- Staff only, through the RLS-bound user client. Deliberately NOT extended to
-- service_role: the gate board holds that key and has its own read surface from
-- 0013. Nothing new is handed to a key that bypasses RLS.
-- ---------------------------------------------------------------------------

grant select on
  pta.v_attendance_local, pta.v_gate_device_status,
  pta.v_unassigned_cards, pta.v_student_cards_detail
to authenticated;

revoke all on
  pta.v_attendance_local, pta.v_gate_device_status,
  pta.v_unassigned_cards, pta.v_student_cards_detail
from anon;

revoke all on function pta.assign_student_card(uuid, text) from public;
revoke all on function pta.revoke_student_card(uuid)       from public;

grant execute on function pta.assign_student_card(uuid, text) to authenticated;
grant execute on function pta.revoke_student_card(uuid)       to authenticated;
