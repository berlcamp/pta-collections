-- 0023_gate_queue_clear.sql
-- Clearing the enrolment queue, without deleting a single tap.
--
-- ---------------------------------------------------------------------------
-- 1. WHAT "CLEAR" MEANS HERE, AND WHAT IT DOES NOT
-- ---------------------------------------------------------------------------
-- It means "empty this list so I can start again". Nothing more. It is not a
-- judgement that a uid is not a student card, it does not remember an opinion
-- about that uid, and it does not put the card on any other list.
--
-- The workflow it serves is the one an operator actually has: a box of new
-- cards, a reader, and a screen. They tap a handful, enrol them, and now the
-- queue holds a mix of what they just did and whatever else has walked past the
-- gate this week. Clearing wipes the slate. Then they tap the next card and it
-- is the only thing on the list — which is the whole point.
--
-- So a cleared card COMES BACK the moment it is tapped again. That is the
-- feature, not a leak. Clearing costs nothing and can be undone by holding the
-- card against the reader, which is a thing the operator is already doing.
--
-- ---------------------------------------------------------------------------
-- 2. WHY IT CANNOT DELETE ANYTHING
-- ---------------------------------------------------------------------------
-- 0015's v_unassigned_cards is derived, not stored: every distinct card_uid in
-- pta.attendance that no active student_cards row holds. The obvious way to
-- shorten it is therefore to delete those attendance rows, and that is wrong in
-- the way this project is most careful about. pta.attendance is the RECORD --
-- what v_attendance_local counts, what a parent sees in the portal, and what
-- the school would produce if asked whether the gate was working on a given
-- morning. Tidying an admin screen is not a reason to make a morning's traffic
-- disappear.
--
-- So clearing writes a WATERMARK instead: one row per uid saying when the list
-- was last emptied. The view hides a uid whose taps all predate its watermark,
-- and shows it again as soon as a newer one lands. Nothing is deleted, nothing
-- is remembered about the card itself, and 0013's record_attendance() is
-- untouched: a cleared card that taps again is still recorded, still counted,
-- and still on the live monitor. It was only ever off this one working list.
--
-- ---------------------------------------------------------------------------
-- 3. THE WATERMARK IS received_at, NOT scanned_at
-- ---------------------------------------------------------------------------
-- The device is built to survive an outage and flush afterwards, so a batch can
-- land at 09:00 carrying taps stamped 07:00. Comparing the clear against
-- scanned_at would swallow exactly that batch: the operator clears at 08:00,
-- the queue takes delivery of twenty cards at 09:00, and not one of them
-- appears because they all "happened" before the clear.
--
-- received_at is when the server saw the row, which is the question actually
-- being asked -- has anything arrived since I emptied this. A live tap and a
-- flushed one both answer it correctly.
--
-- Apply by hand in the SQL Editor, in order, like every other migration here.
-- Never `supabase db push`: the project is shared with construction-saas and
-- sms-demo.

-- ---------------------------------------------------------------------------
-- gate_card_clears — one watermark per uid per school
--
-- Keyed by (school_id, card_uid) with no surrogate id: only the LAST clear
-- matters, so there is exactly one row and clearing again overwrites it. A
-- history of clears would be a log of somebody pressing a button, which is not
-- a thing anyone will ever need to read.
-- ---------------------------------------------------------------------------

create table if not exists pta.gate_card_clears (
  school_id  uuid not null references pta.schools(id) on delete cascade,
  card_uid   text not null,
  cleared_at timestamptz not null default now(),
  cleared_by uuid references pta.profiles(id) on delete set null,
  primary key (school_id, card_uid),
  -- The same shape student_cards enforces. A uid that could never have come off
  -- a reader was never on the queue, so there is nothing to clear.
  constraint gate_card_clears_uid_format
    check (card_uid ~ '^[0-9A-F]{4,32}$')
);

comment on table pta.gate_card_clears is
  'When each card UID was last cleared off pta.v_unassigned_cards. A watermark, '
  'not an opinion: a later tap puts the card straight back on the queue. '
  'Deletes nothing from pta.attendance.';

alter table pta.gate_card_clears enable row level security;

create policy gate_card_clears_read on pta.gate_card_clears
  for select to authenticated
  using (school_id = any (pta.current_school_ids()));

-- No insert/update/delete policy: the only writer is the RPC below.

-- ---------------------------------------------------------------------------
-- v_unassigned_cards — 0015's view, minus what has been cleared since its last
-- tap arrived.
--
-- Re-declared in full, with the same columns in the same order, because
-- `create or replace view` cannot change a column list. The synthetic-uid
-- filter and the `not exists` against student_cards are 0015's, unchanged and
-- still doing the work their own comments describe.
--
-- The join is LEFT and the test is in HAVING rather than WHERE: a uid with no
-- watermark has never been cleared and must show, and the comparison is against
-- the aggregate max, not against each row.
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
left join pta.gate_card_clears k
       on k.school_id = a.school_id
      and k.card_uid  = a.card_uid
where a.card_uid !~ '^B[0-9]{7}$'
  and not exists (
    select 1
      from pta.student_cards c
     where c.school_id  = a.school_id
       and c.card_uid   = a.card_uid
       and c.revoked_at is null
  )
group by a.school_id, a.card_uid, k.cleared_at
having k.cleared_at is null
    or max(a.received_at) > k.cleared_at;

-- ---------------------------------------------------------------------------
-- clear_unassigned_cards(school, uids[]) -> integer
--
-- Returns how many uids left the list, which is not how many were asked for: a
-- uid a colleague cleared a second earlier is already gone and counts nothing.
--
-- p_card_uids null means "everything on the list right now". That is not the
-- same as the caller sending the list it happens to be showing: between the
-- page rendering and the button being clicked a card can tap for the first
-- time, and clearing a list computed in the browser would leave it behind while
-- the count claimed otherwise. The set is decided here, in the statement that
-- writes it.
--
-- Passing a uid that is not on the list -- one a student already holds, or one
-- already cleared -- is a no-op rather than an error. A stale browser tab must
-- not become a failure the operator cannot act on.
-- ---------------------------------------------------------------------------

create or replace function pta.clear_unassigned_cards(
  p_school_id uuid,
  p_card_uids text[] default null
) returns integer
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  v_count integer;
begin
  if p_school_id is null then
    raise exception 'a school is required' using errcode = '22023';
  end if;

  -- The same gate card enrolment uses. A super admin passes for any active
  -- school (0005), and acting_as_super_admin() records that in the audit row.
  perform pta.require_school_role(p_school_id, array['admin']);

  with target as (
    select q.card_uid
      from pta.v_unassigned_cards q
     where q.school_id = p_school_id
       and (
         p_card_uids is null
         or q.card_uid in (select upper(btrim(u)) from unnest(p_card_uids) as u)
       )
  ),
  written as (
    insert into pta.gate_card_clears (school_id, card_uid, cleared_at, cleared_by)
    select p_school_id, t.card_uid, now(), pta.current_profile_id()
      from target t
    -- DO UPDATE, not DO NOTHING: a card cleared last week and tapped since is
    -- back on the list, and clearing it again has to move its watermark
    -- forward or the second click would do nothing at all.
    on conflict (school_id, card_uid) do update
      set cleared_at = excluded.cleared_at,
          cleared_by = excluded.cleared_by
    returning card_uid
  )
  select count(*) into v_count from written;

  if v_count = 0 then
    return 0;
  end if;

  -- One row per click, recording the size of the gesture and not the uids: the
  -- uids are still in pta.attendance, where they always were, and a list of
  -- them here would suggest something happened to them.
  perform pta.write_audit(
    p_school_id, 'GATE_QUEUE_CLEARED', 'gate_card_clear', null,
    null,
    jsonb_build_object(
      'count', v_count,
      'scope', case when p_card_uids is null then 'queue' else 'selection' end
    )
  );

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants.
--
-- Staff only, through the RLS-bound user client, exactly like 0015. Nothing is
-- extended to service_role: the gate board holds that key and its read surface
-- is 0013's. anon holds nothing here, as everywhere else in pta.
-- ---------------------------------------------------------------------------

grant select on pta.gate_card_clears to authenticated;
revoke all  on pta.gate_card_clears from anon;

revoke all on function pta.clear_unassigned_cards(uuid, text[]) from public;
grant execute on function pta.clear_unassigned_cards(uuid, text[]) to authenticated;
