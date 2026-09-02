-- 0022_parent_cards_automatic.sql
-- A parent card stops being something the office remembers to hand out.
--
-- ---------------------------------------------------------------------------
-- 1. WHY THE QUEUE WAS THE WRONG SHAPE
-- ---------------------------------------------------------------------------
-- 0016 made issuance a deliberate act: a staff member finds the guardian in
-- "Awaiting a card", clicks Issue, and reads the number off a slip that can
-- never be shown again. That is the right ceremony for ONE card handed over a
-- counter to a parent standing there.
--
-- It is the wrong ceremony for a school. A PTA enrols its roster in June, in
-- bulk, from a CSV — four thousand students, two and a half thousand distinct
-- guardians — and then hands the whole list to a printing press that returns a
-- box of laminated cards in a week. Nobody is standing at a counter. Clicking
-- Issue two and a half thousand times is not a security control, it is a data
-- entry job that will be half finished, and every guardian it misses is a
-- family that cannot reach the portal and does not know why.
--
-- Worse, the miss is INVISIBLE from the parent's side. There is no error: the
-- portal simply says the card is unknown, which is the same thing it says to an
-- attacker. "Awaiting a card" was the only place the gap showed, and it was a
-- list somebody had to think to go and look at.
--
-- So the card follows the child. A guardian is linked to a student; that link
-- is what a parent card is FOR, and it is now what mints one.
--
-- ---------------------------------------------------------------------------
-- 2. THE TRIGGER IS ON student_guardians, NOT parents_guardians
-- ---------------------------------------------------------------------------
-- Both would be defensible and one is right. A card shows a guardian their
-- children's gate arrivals and balances; a guardian with no child on file would
-- sign in and be shown nothing at all. That is not hypothetical — `donors` and
-- `parents_guardians` overlap, and 0014's alumnus or hardware store giving to a
-- program is a guardian row with no student behind it. PP17n has asserted since
-- 0016 that such a person is not "awaiting a card", and minting one for them
-- would hand out a live bearer credential for an empty portal.
--
-- Firing on the LINK gets both: the roster case is unchanged, because the
-- guardian row and the student_guardians row are written in the same
-- transaction by createStudent() and by commit_student_import(); and the donor
-- case stays correctly cardless until the day a child is actually enrolled
-- under them, at which point the trigger fires and they get one.
--
-- The trigger's rule is now EXACTLY v_parent_cards_pending's rule, which means
-- that view should be permanently empty. It is kept, and the screen still keeps
-- its Issue button, because "permanently empty" is a claim worth being able to
-- check: a row appearing there is now a REPAIR surface, not a work queue.
--
-- ---------------------------------------------------------------------------
-- 3. THE TRIGGER SWALLOWS ITS OWN FAILURE, ON PURPOSE
-- ---------------------------------------------------------------------------
-- This project's standing rule is that things must not fail quietly, and a
-- swallowed exception is the classic way they do. The exception is deliberate
-- and narrow: a card is a CONSEQUENCE of enrolling a child, not a precondition
-- of it. A raising trigger here would roll back the student registration, or
-- take down a four-thousand-row CSV import, over a credential that can be
-- minted again in one click afterwards. That trade is the same one CLAUDE.md
-- makes about auth.users, one table down.
--
-- It is not quiet in the sense that matters, because the failure is VISIBLE
-- where somebody will see it: the guardian stays in v_parent_cards_pending, the
-- "Awaiting a card" tile on /super/parent-cards counts them, and Issue still
-- works. A warning also goes to the Postgres log.
--
-- ---------------------------------------------------------------------------
-- 4. WHAT THIS COSTS: NOBODY READS THE BOOTSTRAP PIN
-- ---------------------------------------------------------------------------
-- issue_parent_card() returned the number and the PIN exactly once, to the
-- person who clicked. An automatic issuance has no such person, so the minted
-- PIN is written as a hash and never seen by anyone.
--
-- For the schools this is built for that changes nothing: portal_require_pin
-- defaults to OFF (0017) and the barcode alone signs in. For a school that
-- turns it on, the answer is the one 0016 already built — reset_parent_pin()
-- mints a fresh PIN and shows it, at the counter, to the parent standing there.
-- That is the correct place for a PIN to be handed over anyway; a PIN printed
-- in a batch of two thousand slips and carried across town by a courier is not
-- a second factor.
--
-- Nothing is weakened to make this work: a PIN is still minted and hashed on
-- every issuance, so turning the setting on later still needs no reissue.
--
-- ---------------------------------------------------------------------------
-- 5. THE PRINT ROSTER IS A BULK REVEAL, AND IS PRICED AS ONE
-- ---------------------------------------------------------------------------
-- A printing press needs the numbers. All of them, in one file, in plain text
-- next to a name. That is precisely what 0016 spent its design budget making
-- impossible and 0020 re-opened one card at a time, so parent_card_roster()
-- carries 0020's restrictions rather than inventing softer ones:
--
--   * SUPER ADMIN ONLY, pta.is_super_admin(), not a role array. An admin and a
--     treasurer may issue cards and still cannot read one back, let alone all
--     of them.
--   * An RPC, never a view column. A card_number column on
--     v_parent_cards_detail would be read by whoever loaded the list.
--   * Audited — one row per print run, recording the COUNT and never the
--     numbers, because audit_logs is readable by every admin and treasurer at
--     the school and PP14 exists to keep card numbers out of it.
--   * Active cards only. A revoked number has nothing to print.
--
-- What it does NOT return is the PIN, which does not exist to return.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. mint_parent_card — the issuance itself, with no authorization in it
--
-- Split out of issue_parent_card() so the trigger and the button share one
-- body: a card minted automatically and a card minted by an admin must be the
-- same object, down to the audit row. The authorization stays in the CALLERS,
-- because they are what differ — a staff click is checked against a role, and a
-- trigger firing inside an already-authorized insert has no role to check.
--
-- Not granted to anyone. It is called only from the two definer functions
-- below, both of which run as the owner.
--
-- Idempotent: returns null rather than raising when the guardian already holds
-- a card, so a sibling's link is a no-op instead of an error.
-- ---------------------------------------------------------------------------

create or replace function pta.mint_parent_card(p_guardian_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  v_school uuid;
  v_card   text;
  v_pin    text;
  v_salt   text;
  v_id     uuid;
  v_tries  int := 0;
begin
  select school_id into v_school from pta.parents_guardians where id = p_guardian_id;
  if not found then
    raise exception 'no such guardian: %', p_guardian_id using errcode = '23503';
  end if;

  if exists (select 1 from pta.portal_accounts where guardian_id = p_guardian_id) then
    return null;
  end if;

  -- Globally unique across every school, so the login form stays one field.
  -- Collision at 10^15 is theoretical; the loop is here so that if it ever
  -- happens it is a retry rather than a failed issuance at a counter.
  loop
    v_card  := pta.generate_card_number();
    v_tries := v_tries + 1;
    exit when not exists (select 1 from pta.portal_accounts where card_number = v_card);
    if v_tries > 10 then
      raise exception 'Could not allocate a card number.' using errcode = '55000';
    end if;
  end loop;

  v_pin  := pta.generate_pin();
  v_salt := replace(gen_random_uuid()::text, '-', '');

  insert into pta.portal_accounts
    (school_id, guardian_id, card_number, pin_hash, pin_salt, must_change_pin, issued_by)
  values
    (v_school, p_guardian_id, v_card, pta.portal_hash_pin(v_pin, v_salt), v_salt, true,
     pta.current_profile_id())
  returning id into v_id;

  -- The audit row records THAT a card was issued and to whom. It does not
  -- record the number: audit_logs is readable by every member of the school.
  -- issued_by / profile_id is null for an automatic issuance and for the
  -- backfill below, which is honest -- no person decided this one.
  perform pta.write_audit(
    v_school, 'PORTAL_CARD_ISSUED', 'portal_account', v_id,
    null, jsonb_build_object('guardian_id', p_guardian_id, 'last4', right(v_card, 4))
  );

  return jsonb_build_object('ok', true, 'account_id', v_id,
                            'card_number', v_card, 'pin', v_pin);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. issue_parent_card — now authorization plus a call
--
-- Unchanged from the caller's side: same signature, same jsonb, same duplicate
-- error the TypeScript matches on. It stays because automatic issuance can fail
-- (see departure 3) and because a guardian who acquires their first child by an
-- edit rather than an insert still arrives through the trigger -- but a person
-- needs to be able to force the issue when neither happened.
-- ---------------------------------------------------------------------------

create or replace function pta.issue_parent_card(p_guardian_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  v_school uuid;
begin
  select school_id into v_school from pta.parents_guardians where id = p_guardian_id;
  if not found then
    raise exception 'no such guardian: %', p_guardian_id using errcode = '23503';
  end if;

  perform pta.require_school_role(v_school, array['admin', 'treasurer']);

  -- mint_parent_card() would simply return null. A person who clicked Issue is
  -- owed the reason, and the TypeScript matches on this sentence.
  if exists (select 1 from pta.portal_accounts where guardian_id = p_guardian_id) then
    raise exception 'This guardian already holds a parent card.' using errcode = '23505';
  end if;

  return pta.mint_parent_card(p_guardian_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The trigger
-- ---------------------------------------------------------------------------

create or replace function pta.parent_card_autoissue()
returns trigger
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
begin
  begin
    perform pta.mint_parent_card(new.guardian_id);
  exception when others then
    -- Deliberate. See departure 3: the card is a consequence of enrolling a
    -- child, not a precondition of it, and this guardian is now sitting in
    -- v_parent_cards_pending where the screen counts them and Issue still works.
    raise warning 'parent card auto-issue failed for guardian %: % (%)',
      new.guardian_id, sqlerrm, sqlstate;
  end;
  return null;
end;
$$;

drop trigger if exists student_guardians_autoissue_card on pta.student_guardians;
create trigger student_guardians_autoissue_card
  after insert on pta.student_guardians
  for each row execute function pta.parent_card_autoissue();

-- ---------------------------------------------------------------------------
-- 4. Backfill — every guardian already on the roll
--
-- The trigger only covers links made from here on. This is the school that is
-- already running: guardians enrolled before today, none of whom will ever be
-- re-linked to a child. Without this the feature would only reach next June's
-- intake.
--
-- Idempotent by way of mint_parent_card()'s null return, so re-running the file
-- mints nothing and is safe.
-- ---------------------------------------------------------------------------

do $$
declare
  g record;
  n int := 0;
begin
  for g in
    select distinct sg.guardian_id
      from pta.student_guardians sg
     where not exists (select 1 from pta.portal_accounts a
                        where a.guardian_id = sg.guardian_id)
  loop
    perform pta.mint_parent_card(g.guardian_id);
    n := n + 1;
  end loop;
  raise notice 'parent cards backfilled: %', n;
end $$;

-- ---------------------------------------------------------------------------
-- 5. parent_card_roster(school_id) — the printing press list
--
-- See departure 5. This is reveal_parent_card() times the whole school, and it
-- carries the same restrictions rather than softer ones.
-- ---------------------------------------------------------------------------

create or replace function pta.parent_card_roster(p_school_id uuid)
returns table (
  account_id     uuid,
  guardian_id    uuid,
  guardian_name  text,
  contact_number text,
  children       bigint,
  card_number    text,
  issued_at      timestamptz
)
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  v_count int;
begin
  if not pta.is_super_admin() then
    raise exception 'Not authorized: only a super admin may print a card roster.'
      using errcode = '42501';
  end if;

  select count(*) into v_count
    from pta.portal_accounts a
   where a.school_id = p_school_id and a.status = 'active';

  -- The COUNT, never the numbers. PP14 keeps card numbers out of audit_logs and
  -- a print run must not be the way two thousand of them get in.
  perform pta.write_audit(
    p_school_id, 'PORTAL_CARD_ROSTER_PRINTED', 'school', p_school_id,
    null, jsonb_build_object('cards', v_count)
  );

  return query
  select a.id,
         a.guardian_id,
         pta.display_name(g.last_name, g.first_name, g.middle_name, g.suffix),
         g.contact_number,
         (select count(*) from pta.student_guardians sg where sg.guardian_id = a.guardian_id),
         a.card_number,
         a.issued_at
    from pta.portal_accounts a
    join pta.parents_guardians g on g.id = a.guardian_id
   where a.school_id = p_school_id
     and a.status = 'active'
   order by pta.display_name(g.last_name, g.first_name, g.middle_name, g.suffix);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants
--
-- mint_parent_card() and the trigger function are granted to NOBODY: the first
-- is the unauthorized half of an issuance and is called only by the two definer
-- functions above; the second is called only by Postgres.
-- ---------------------------------------------------------------------------

revoke all on function pta.mint_parent_card(uuid)      from public;
revoke all on function pta.parent_card_autoissue()     from public;
revoke all on function pta.parent_card_roster(uuid)    from public;

-- Re-asserted rather than assumed: the body was replaced above.
revoke all    on function pta.issue_parent_card(uuid)  from public;
grant execute on function pta.issue_parent_card(uuid)  to authenticated;

grant execute on function pta.parent_card_roster(uuid) to authenticated;
