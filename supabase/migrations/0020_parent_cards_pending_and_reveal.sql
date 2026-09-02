-- 0020_parent_cards_pending_and_reveal.sql
-- Two things about the parent-card screen, which moved to /super/parent-cards
-- (Gate attendance → Parent cards) and got looked at properly for the first
-- time as a result.
--
-- ---------------------------------------------------------------------------
-- 1. "AWAITING A CARD" NEVER EMPTIED
-- ---------------------------------------------------------------------------
-- Issue a card, refresh, and the guardian was still sitting in the queue —
-- alongside a card of theirs in the issued list. Pressing Issue again then
-- failed with "This guardian already holds a parent card", which is the RPC
-- correctly refusing a duplicate credential for one human.
--
-- 0016's view:
--
--     create or replace view pta.v_parent_cards_pending
--     with (security_invoker = on) as
--     ...
--     where not exists (select 1 from pta.portal_accounts a
--                        where a.guardian_id = g.id)
--
-- security_invoker = ON means RLS runs as the CALLER inside that subquery, and
-- pta.portal_accounts is the one table in this schema with NO POLICY AT ALL —
-- deliberately, because RLS is row-level and any policy letting a cashier see
-- their school's rows lets them see card_number and pin_hash inside those rows.
-- 07_portal.sql asserts exactly that, twice:
--
--     PP17c. Neither does an admin — the table has no read policy at all
--     PP17e. Not even a super admin reads the raw credential table
--
-- So the subquery found nothing, for anybody, ever. `not exists` was a constant
-- TRUE and every guardian with a child on file stayed "pending" for life. The
-- view was never actually filtering — it just looked like it was.
--
-- This is the same trap 0016's own header describes for the portal views, from
-- the other side: a table nobody may read cannot be consulted by an invoker
-- view. v_parent_cards_detail, which reads the same table, was already definer
-- for this reason. Its sibling was not, and nothing caught it because
-- v_parent_cards_pending had no test.
--
-- The fix is the shape 0016 already uses next door: the view becomes DEFINER
-- and carries its own tenant filter. Compiled-in scoping is not optional here —
-- an invoker view delegates to RLS, a definer view must state the WHERE itself,
-- and `where g.school_id = any (pta.current_school_ids())` is the whole of what
-- keeps School A's guardian list out of School B.
--
-- ---------------------------------------------------------------------------
-- 2. A SUPER ADMIN CAN READ A CARD NUMBER BACK
-- ---------------------------------------------------------------------------
-- 0016 made the number unrecoverable on purpose: shown once at issuance, masked
-- everywhere after. That friction is right for the people it was written about
-- — a cashier reads parent card numbers off the POS scanner all day, and a card
-- number is a single-factor bearer credential wherever portal_require_pin is
-- off (0017). None of that is loosened here. What it did NOT have was a way to
-- reprint a slip that was lost between the office and the parent, and the only
-- remedy left was revoke-and-reissue: a new number, a new card, and a family
-- locked out in the meantime for a lost piece of paper.
--
-- reveal_parent_card() is that remedy, and it is narrow on purpose:
--
--   * SUPER ADMIN ONLY, checked with pta.is_super_admin() rather than a role
--     array. Not admin, not treasurer — the two roles that may ISSUE a card
--     still cannot read one back. Issuing mints a fresh secret; revealing
--     copies one that is already in a parent's hands.
--   * It stays an RPC, never a view column. A `card_number` column on
--     v_parent_cards_detail would be read by whoever held a staff token the
--     moment they loaded the list; a function call is one card, deliberately
--     asked for, one audit row at a time.
--   * The audit row records last4 only. PP14 asserts that issuance never writes
--     the number into audit_logs, and a reveal must not be the way it gets
--     there — audit_logs is readable by every admin and treasurer at the school.
--   * Active cards only. A revoked number has no legitimate reprint; the answer
--     to a revoked card is a new one.
--
-- The PIN is NOT revealable and cannot be: it exists only as 25,000 rounds of
-- sha256 over a per-account salt. reset_parent_pin() remains the only answer to
-- a forgotten PIN, which is the same friction 0016 chose.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. v_parent_cards_pending — definer, with the tenant filter compiled in
-- ---------------------------------------------------------------------------

create or replace view pta.v_parent_cards_pending
with (security_invoker = off) as
select
  g.id as guardian_id,
  g.school_id,
  pta.display_name(g.last_name, g.first_name, g.middle_name, g.suffix) as guardian_name,
  g.contact_number,
  (select count(*) from pta.student_guardians sg where sg.guardian_id = g.id) as children
from pta.parents_guardians g
-- NOT OPTIONAL. Definer means RLS on parents_guardians no longer applies, so
-- this line is the only thing scoping the list to the caller's schools.
where g.school_id = any (pta.current_school_ids())
  and not exists (select 1 from pta.portal_accounts a where a.guardian_id = g.id)
  and exists (select 1 from pta.student_guardians sg where sg.guardian_id = g.id);

-- Re-asserted rather than assumed. `create or replace view` keeps the existing
-- grants, but this view's whole problem was a property nobody had re-read.
grant select on pta.v_parent_cards_pending to authenticated;
revoke all  on pta.v_parent_cards_pending from anon;

-- ---------------------------------------------------------------------------
-- 2. reveal_parent_card(account_id) -> jsonb {card_number, guardian_name}
-- ---------------------------------------------------------------------------

create or replace function pta.reveal_parent_card(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  acct   pta.portal_accounts%rowtype;
  v_name text;
begin
  -- Authorization BEFORE the lookup would be tidier, but the row is needed for
  -- school_id on the audit write and the order is unobservable: both failures
  -- raise, and a super admin is a super admin in every school.
  select * into acct from pta.portal_accounts where id = p_account_id;
  if not found then
    raise exception 'no such parent card: %', p_account_id using errcode = '23503';
  end if;

  if not pta.is_super_admin() then
    raise exception 'Not authorized: only a super admin may read a card number back.'
      using errcode = '42501';
  end if;

  if acct.status <> 'active' then
    raise exception 'That card is revoked. Issue a new one instead.'
      using errcode = '22023';
  end if;

  select pta.display_name(g.last_name, g.first_name, g.middle_name, g.suffix)
    into v_name
    from pta.parents_guardians g
   where g.id = acct.guardian_id;

  -- last4 only. audit_logs is readable by every admin and treasurer at this
  -- school, so writing the number here would hand it to precisely the people
  -- the masking exists to keep it from.
  perform pta.write_audit(
    acct.school_id, 'PORTAL_CARD_REVEALED', 'portal_account', p_account_id,
    null, jsonb_build_object('last4', right(acct.card_number, 4))
  );

  return jsonb_build_object(
    'ok', true,
    'card_number', acct.card_number,
    'guardian_name', v_name
  );
end;
$$;

revoke all     on function pta.reveal_parent_card(uuid) from public;
grant execute  on function pta.reveal_parent_card(uuid) to authenticated;
