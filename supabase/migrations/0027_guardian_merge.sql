-- 0027_guardian_merge.sql — finding and merging duplicate parent records.
--
-- Siblings are one family because they share a parent ROW. When the same
-- mother was typed in twice — "Ma. Santos" for one child, "Maria Santos" for
-- the next — the system sees two families: two parent cards, two portal
-- logins each showing half the children, and (once fees can be per family)
-- two charges. This is the repair.
--
-- Three things:
--
--   1. pta.v_guardian_duplicates — likely pairs, by the same mobile number,
--      the same name, or the same last name with a similar first name.
--      SECURITY INVOKER: a read, so RLS on parents_guardians scopes it.
--      Pairs an admin has marked "not the same person" (spouses sharing one
--      phone, two different Maria Santos) are kept in
--      guardian_duplicate_dismissals and left out.
--
--   2. pta.merge_guardians(keep, merge) — moves the duplicate's children,
--      Telegram link and donor history onto the record being kept, in ONE
--      transaction, and audits it. Admin only.
--
--   3. A BEFORE INSERT trigger on student_guardians that redirects a link
--      aimed at a merged record to the record it was merged into. Every
--      writer of that table — createStudent, commit_student_import, the gate
--      board's enrol tokens — matches parents its own way, and all of them
--      could otherwise find the merged husk by name and link a child to it.
--      One trigger covers them all; it never raises, it only re-aims.
--
-- WHY THE DUPLICATE IS KEPT, NOT DELETED
--
-- parents_guardians is referenced ON DELETE CASCADE by portal_accounts, and
-- portal_accounts by payment_claims. Deleting the duplicate would delete its
-- parent card and every online payment it ever submitted — the record of who
-- claimed to have sent what. So the row stays, marked merged_into, with no
-- children: invisible to the roll, the portal and the card queue (all of which
-- go through student_guardians), and still the anchor for its own history.
--
-- PARENT CARDS
--
--   - Only the duplicate holds a card: refused. Keep the record with the card
--     instead. Moving the card is not possible in place — payment_claims has a
--     composite FK onto (guardian_id, school_id) of portal_accounts with no
--     ON UPDATE — and revoking a card a parent is using, to mint one they do
--     not have, is a reprint for no reason. The screen pre-selects that record.
--   - Both hold a card: the duplicate's is REVOKED (never deleted), so a
--     parent who signs in with it sees nothing rather than half a family.
--   - Neither holds one: the kept record is minted one if it now has children,
--     exactly as 0022 would have on a link.
--   - The duplicate has an online payment awaiting review: refused until a
--     cashier approves or rejects it, so nobody reviews a claim from a card
--     that was revoked under them.

-- ---------------------------------------------------------------------------
-- The marker
-- ---------------------------------------------------------------------------

alter table pta.parents_guardians
  add column if not exists merged_into uuid references pta.parents_guardians(id),
  add column if not exists merged_at   timestamptz,
  add column if not exists merged_by   uuid references pta.profiles(id);

alter table pta.parents_guardians
  add constraint parents_guardians_not_self_merged check (merged_into <> id);

create index if not exists guardians_merged_into_idx
  on pta.parents_guardians (merged_into) where merged_into is not null;

-- ---------------------------------------------------------------------------
-- "Not the same person"
-- ---------------------------------------------------------------------------

create table pta.guardian_duplicate_dismissals (
  school_id    uuid not null references pta.schools(id) on delete cascade,
  guardian_a   uuid not null references pta.parents_guardians(id) on delete cascade,
  guardian_b   uuid not null references pta.parents_guardians(id) on delete cascade,
  dismissed_by uuid references pta.profiles(id) default pta.current_profile_id(),
  created_at   timestamptz not null default now(),
  primary key (guardian_a, guardian_b),
  -- One row per unordered pair.
  constraint guardian_duplicate_dismissals_order check (guardian_a < guardian_b)
);

alter table pta.guardian_duplicate_dismissals enable row level security;

create policy guardian_duplicate_dismissals_read
  on pta.guardian_duplicate_dismissals for select to authenticated
  using (school_id = any (pta.current_school_ids()));

create policy guardian_duplicate_dismissals_admin_write
  on pta.guardian_duplicate_dismissals for all to authenticated
  using (pta.has_school_role(school_id, array['admin']))
  with check (pta.has_school_role(school_id, array['admin']));

revoke all on pta.guardian_duplicate_dismissals from public, anon;
grant select, insert, delete on pta.guardian_duplicate_dismissals to authenticated;

-- ---------------------------------------------------------------------------
-- 1. v_guardian_duplicates
--
-- Built from three equality joins (number, full name, last name) rather than
-- one similarity() over the cross product, so a school of thousands of parents
-- is a hash join and not millions of trigram comparisons.
-- ---------------------------------------------------------------------------

create or replace view pta.v_guardian_duplicates
with (security_invoker = true) as
with g as (
  select
    pg.id,
    pg.school_id,
    pta.normalize_name(pg.first_name || ' ' || pg.last_name) as full_n,
    pta.normalize_name(pg.last_name)                          as last_n,
    pta.normalize_name(pg.first_name)                         as first_n,
    nullif(right(regexp_replace(coalesce(pg.contact_number, ''), '\D', '', 'g'), 10), '')
                                                              as tail
  from pta.parents_guardians pg
  where pg.merged_into is null
),
pairs as (
  select a.school_id, a.id as a_id, b.id as b_id, 'same_number' as reason
  from g a join g b
    on b.school_id = a.school_id and b.tail = a.tail and b.id > a.id
  where length(a.tail) = 10
  union all
  select a.school_id, a.id, b.id, 'same_name'
  from g a join g b
    on b.school_id = a.school_id and b.full_n = a.full_n and b.id > a.id
  union all
  select a.school_id, a.id, b.id, 'similar_name'
  from g a join g b
    on b.school_id = a.school_id and b.last_n = a.last_n and b.id > a.id
  where a.full_n <> b.full_n
    and public.similarity(a.first_n, b.first_n) >= 0.4
),
grouped as (
  select school_id, a_id, b_id, array_agg(distinct reason order by reason) as reasons
  from pairs
  group by school_id, a_id, b_id
)
select
  p.school_id,
  p.a_id,
  p.b_id,
  p.reasons,
  pta.display_name(ga.last_name, ga.first_name, ga.middle_name, ga.suffix) as a_name,
  ga.contact_number                                                       as a_contact,
  (select string_agg(s.first_name || ' ' || s.last_name, ', ' order by s.first_name)
     from pta.student_guardians sg join pta.students s on s.id = sg.student_id
    where sg.guardian_id = ga.id)                                         as a_children,
  pta.display_name(gb.last_name, gb.first_name, gb.middle_name, gb.suffix) as b_name,
  gb.contact_number                                                       as b_contact,
  (select string_agg(s.first_name || ' ' || s.last_name, ', ' order by s.first_name)
     from pta.student_guardians sg join pta.students s on s.id = sg.student_id
    where sg.guardian_id = gb.id)                                         as b_children
from grouped p
join pta.parents_guardians ga on ga.id = p.a_id
join pta.parents_guardians gb on gb.id = p.b_id
where not exists (
  select 1 from pta.guardian_duplicate_dismissals d
  where d.guardian_a = p.a_id and d.guardian_b = p.b_id
);

revoke all on pta.v_guardian_duplicates from public, anon;
grant select on pta.v_guardian_duplicates to authenticated;

-- ---------------------------------------------------------------------------
-- 2. merge_guardians
-- ---------------------------------------------------------------------------

create or replace function pta.merge_guardians(p_keep uuid, p_merge uuid)
returns jsonb
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  k          pta.parents_guardians%rowtype;
  m          pta.parents_guardians%rowtype;
  k_acct     pta.portal_accounts%rowtype;
  m_acct     pta.portal_accounts%rowtype;
  v_moved    int := 0;
  v_shared   int := 0;
  v_promote  uuid[];
  v_revoked  text := null;
  v_tg_moved boolean := false;
  v_minted   boolean := false;
begin
  if p_keep is null or p_merge is null or p_keep = p_merge then
    raise exception 'Choose two different parent records.';
  end if;

  -- Lock both, in a fixed order, so two admins merging A↔B and B↔A at once
  -- wait on each other instead of deadlocking.
  perform 1 from pta.parents_guardians
   where id in (p_keep, p_merge) order by id for update;

  select * into k from pta.parents_guardians where id = p_keep;
  select * into m from pta.parents_guardians where id = p_merge;
  if k.id is null or m.id is null then
    raise exception 'Parent record not found.' using errcode = '23503';
  end if;
  if k.school_id <> m.school_id then
    raise exception 'Those parents are in different schools.' using errcode = '42501';
  end if;

  perform pta.require_school_role(k.school_id, array['admin']);

  if k.merged_into is not null or m.merged_into is not null then
    raise exception 'One of these records has already been merged.';
  end if;

  select * into k_acct from pta.portal_accounts where guardian_id = p_keep;
  select * into m_acct from pta.portal_accounts where guardian_id = p_merge;

  if m_acct.id is not null and k_acct.id is null then
    raise exception 'Keep the record that holds the parent card (ending %) — choose it as the one to keep.',
      right(m_acct.card_number, 4);
  end if;

  if exists (select 1 from pta.payment_claims
              where guardian_id = p_merge and status = 'submitted') then
    raise exception 'This parent has an online payment waiting for review. Approve or reject it first.';
  end if;

  -- Children linked to BOTH: drop the duplicate's link, carrying its
  -- primary flag over. Delete first — one primary per student is a unique index.
  select count(*), coalesce(array_agg(mg.student_id) filter (where mg.is_primary), '{}')
    into v_shared, v_promote
  from pta.student_guardians mg
  join pta.student_guardians kg
    on kg.student_id = mg.student_id and kg.guardian_id = p_keep
  where mg.guardian_id = p_merge;

  delete from pta.student_guardians mg
  where mg.guardian_id = p_merge
    and exists (select 1 from pta.student_guardians kg
                 where kg.student_id = mg.student_id and kg.guardian_id = p_keep);

  update pta.student_guardians set is_primary = true
   where guardian_id = p_keep and student_id = any (v_promote);

  -- Everyone else moves across as they are.
  update pta.student_guardians set guardian_id = p_keep where guardian_id = p_merge;
  get diagnostics v_moved = row_count;

  -- Fill the kept record's blanks; never overwrite what it already has.
  update pta.parents_guardians set
    middle_name    = coalesce(middle_name, m.middle_name),
    suffix         = coalesce(suffix, m.suffix),
    contact_number = coalesce(contact_number, m.contact_number),
    email          = coalesce(email, m.email),
    address        = coalesce(address, m.address),
    occupation     = coalesce(occupation, m.occupation)
  where id = p_keep;

  -- Telegram follows the person when the kept record has none. Cleared on the
  -- duplicate first: (school_id, telegram_chat_id) is unique.
  if k.telegram_chat_id is null and m.telegram_chat_id is not null then
    update pta.parents_guardians
       set telegram_chat_id = null, telegram_active = false
     where id = p_merge;
    update pta.parents_guardians
       set telegram_chat_id   = m.telegram_chat_id,
           telegram_active    = m.telegram_active,
           telegram_linked_at = m.telegram_linked_at
     where id = p_keep;
    v_tg_moved := true;
  end if;

  -- Giving history goes with the person (0014: set null on delete, so it was
  -- always meant to outlive a guardian row).
  update pta.donors set guardian_id = p_keep where guardian_id = p_merge;

  if m_acct.id is not null and m_acct.status = 'active' then
    update pta.portal_accounts
       set status = 'revoked', revoked_at = now(),
           status_reason = 'Merged into another parent record'
     where id = m_acct.id;
    v_revoked := right(m_acct.card_number, 4);
  end if;

  -- Anything already merged INTO the duplicate now points at the survivor,
  -- so the redirect below is never more than one hop.
  update pta.parents_guardians set merged_into = p_keep where merged_into = p_merge;

  update pta.parents_guardians
     set merged_into = p_keep, merged_at = now(), merged_by = pta.current_profile_id()
   where id = p_merge;

  -- A kept record with children and no card gets one, as a link would have.
  if k_acct.id is null
     and exists (select 1 from pta.student_guardians where guardian_id = p_keep) then
    begin
      v_minted := pta.mint_parent_card(p_keep) is not null;
    exception when others then
      -- As in 0022: the card is a consequence, never a reason to undo the
      -- merge. The record shows in "Missed a card" and Issue still works.
      v_minted := false;
    end;
  end if;

  perform pta.write_audit(
    k.school_id, 'GUARDIAN_MERGED', 'parents_guardian', p_keep,
    jsonb_build_object(
      'merged_id', p_merge,
      'merged_name', pta.display_name(m.last_name, m.first_name, m.middle_name, m.suffix),
      'merged_contact', m.contact_number
    ),
    jsonb_build_object(
      'children_moved', v_moved,
      'children_shared', v_shared,
      'card_revoked_last4', v_revoked,
      'telegram_moved', v_tg_moved,
      'card_minted', v_minted
    )
  );

  return jsonb_build_object(
    'children_moved', v_moved,
    'children_shared', v_shared,
    'card_revoked_last4', v_revoked,
    'telegram_moved', v_tg_moved,
    'card_minted', v_minted
  );
end;
$$;

revoke execute on function pta.merge_guardians(uuid, uuid) from public, anon;
grant  execute on function pta.merge_guardians(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. A link to a merged record lands on the survivor
-- ---------------------------------------------------------------------------

create or replace function pta.student_guardians_follow_merge()
returns trigger
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  v_target uuid;
begin
  select merged_into into v_target from pta.parents_guardians where id = new.guardian_id;
  if v_target is not null then
    new.guardian_id := v_target;
  end if;
  return new;
end;
$$;

revoke execute on function pta.student_guardians_follow_merge() from public, anon, authenticated;

-- BEFORE, so the unique (student_id, guardian_id) that `on conflict do
-- nothing` relies on, and 0022's AFTER INSERT card trigger, both see the
-- survivor's id.
create trigger student_guardians_follow_merge
  before insert or update of guardian_id on pta.student_guardians
  for each row execute function pta.student_guardians_follow_merge();
