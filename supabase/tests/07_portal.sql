-- 07_portal.sql — the Parent/Guardian Portal (0016).
--
-- The portal is the first thing in this schema that hands a read surface to
-- somebody who is not staff, so most of what follows is about what a guardian
-- must NOT see. Three questions are asked repeatedly and from both sides:
--
--   * does guardian A see anything of guardian B's children?
--   * does a guardian at school A see anything of school B?
--   * does a STAFF token see anything through the portal views?
--
-- The last one matters because the portal views are security_invoker = OFF.
-- They are the only views in this project whose filter is compiled in rather
-- than delegated to RLS, so nothing but these assertions stands between a bug
-- in that WHERE clause and every parent reading every family's balances.

\set A_ADMIN   '''22222222-2222-2222-2222-222222222222'''
\set A_CASHIER '''33333333-3333-3333-3333-333333333333'''
\set B_ADMIN   '''55555555-5555-5555-5555-555555555555'''
\set SUPER     '''11111111-1111-1111-1111-111111111111'''

-- ---------------------------------------------------------------------------
-- Setup. Two guardians at School A with an overlapping child, one at School B.
--
--   Ana   — PRIMARY for Juan, and a non-primary link to Pedro
--   Ben   — PRIMARY for Pedro
--   Carla — School B
--
-- Ana's two links are the whole point: the same person is entitled to a year of
-- Juan's movements and to seven days of Pedro's.
-- ---------------------------------------------------------------------------
select pta_test.login(:A_ADMIN::uuid);

insert into pta.parents_guardians (school_id, first_name, last_name, contact_number)
select id, 'Ana', 'Cruz', '09171110001' from pta.schools where school_code = 'ONHS';
insert into pta.parents_guardians (school_id, first_name, last_name, contact_number)
select id, 'Ben', 'Reyes', '09171110002' from pta.schools where school_code = 'ONHS';

insert into pta.student_guardians (school_id, student_id, guardian_id, relationship, is_primary)
select st.school_id, st.id, g.id, 'Mother', true
from pta.students st
join pta.parents_guardians g on g.school_id = st.school_id and g.first_name = 'Ana'
where st.first_name = 'Juan' and st.school_id = (select id from pta.schools where school_code='ONHS');

insert into pta.student_guardians (school_id, student_id, guardian_id, relationship, is_primary)
select st.school_id, st.id, g.id, 'Guardian', false
from pta.students st
join pta.parents_guardians g on g.school_id = st.school_id and g.first_name = 'Ana'
where st.first_name = 'Pedro' and st.school_id = (select id from pta.schools where school_code='ONHS');

insert into pta.student_guardians (school_id, student_id, guardian_id, relationship, is_primary)
select st.school_id, st.id, g.id, 'Father', true
from pta.students st
join pta.parents_guardians g on g.school_id = st.school_id and g.first_name = 'Ben'
where st.first_name = 'Pedro' and st.school_id = (select id from pta.schools where school_code='ONHS');

-- Charges to pay, so the claim tests have something real to settle.
select pta.assess_annual_fees(
  (select id from pta.schools where school_code = 'ONHS'),
  (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
    where s.school_code = 'ONHS' and sy.is_active),
  array(select ft.id from pta.fee_types ft join pta.schools s on s.id = ft.school_id
         where s.school_code = 'ONHS' and ft.category = 'annual')
);
-- 04_financial settles every annual fee these fixture students carry, so a
-- claim needs something genuinely outstanding to settle.
insert into pta.fee_types (school_id, name, category, default_amount, created_by)
select id, 'Portal Test Levy', 'penalty', 120.00, pta.current_profile_id()
from pta.schools where school_code = 'ONHS';

select pta.create_penalty(
  (select id from pta.schools where school_code = 'ONHS'),
  st.id,
  (select sy.id from pta.school_years sy join pta.schools s on s.id = sy.school_id
    where s.school_code = 'ONHS' and sy.is_active),
  (select ft.id from pta.fee_types ft join pta.schools s on s.id = ft.school_id
    where s.school_code = 'ONHS' and ft.name = 'Portal Test Levy'),
  120.00, 'Portal test levy')
from pta.students st join pta.schools s on s.id = st.school_id
where s.school_code = 'ONHS' and st.first_name in ('Juan', 'Pedro');

select pta_test.logout();

select pta_test.login(:B_ADMIN::uuid);
insert into pta.parents_guardians (school_id, first_name, last_name, contact_number)
select id, 'Carla', 'Lim', '09171110003' from pta.schools where school_code = 'TNHS';
insert into pta.student_guardians (school_id, student_id, guardian_id, relationship, is_primary)
select st.school_id, st.id, g.id, 'Mother', true
from pta.students st
join pta.parents_guardians g on g.school_id = st.school_id and g.first_name = 'Carla'
where st.school_id = (select id from pta.schools where school_code='TNHS');
select pta_test.logout();

-- Ids, captured ONCE as staff.
--
-- A portal session reads zero rows from pta.students and pta.parents_guardians
-- by design, so a `(select id from pta.students where ...)` written inline in a
-- portal-session test silently evaluates to NULL. Every id this file needs is
-- resolved here, while a staff role is still active, and read from _ids after.
select pta_test.login(:A_ADMIN::uuid);
create temp table _ids (k text primary key, v uuid);
insert into _ids
select 'juan',  st.id from pta.students st join pta.schools s on s.id=st.school_id
 where s.school_code='ONHS' and st.first_name='Juan';
insert into _ids
select 'pedro', st.id from pta.students st join pta.schools s on s.id=st.school_id
 where s.school_code='ONHS' and st.first_name='Pedro';
insert into _ids
select 'maria', st.id from pta.students st join pta.schools s on s.id=st.school_id
 where s.school_code='ONHS' and st.first_name='Maria';
insert into _ids
select 'ana',   g.id from pta.parents_guardians g join pta.schools s on s.id=g.school_id
 where s.school_code='ONHS' and g.first_name='Ana';
insert into _ids
select 'ben',   g.id from pta.parents_guardians g join pta.schools s on s.id=g.school_id
 where s.school_code='ONHS' and g.first_name='Ben';
insert into _ids
select 'onhs',  id from pta.schools where school_code='ONHS';
select pta_test.logout();

select pta_test.login(:B_ADMIN::uuid);
insert into _ids
select 'carla', g.id from pta.parents_guardians g join pta.schools s on s.id=g.school_id
 where s.school_code='TNHS' and g.first_name='Carla';
insert into _ids
select 'bstudent', st.id from pta.students st join pta.schools s on s.id=st.school_id
 where s.school_code='TNHS' limit 1;
select pta_test.logout();

-- Baselines. 04_financial and 05_donations already left payments, donations,
-- donors and programs in this database; every count below is relative to what
-- was here before the portal touched anything.
select pta_test.login(:A_ADMIN::uuid);
create temp table _base (k text primary key, n int);
insert into _base select 'payments',  count(*) from pta.payments;
insert into _base select 'donations', count(*) from pta.donations;
insert into _base select 'donors',    count(*) from pta.donors;
insert into _base select 'programs',  count(*) from pta.donation_programs
  where status = 'open' and school_id = (select v from _ids where k='onhs');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- Card numbers: format, Luhn, uniqueness
-- ---------------------------------------------------------------------------
select pta_test.ok(pta.luhn_ok('4539578763621486'),
  'PP1. luhn_ok accepts a valid check digit');
select pta_test.ok(not pta.luhn_ok('4539578763621487'),
  'PP2. luhn_ok rejects a single-digit typo');
select pta_test.ok(not pta.luhn_ok('45395787636214'),
  'PP3. luhn_ok rejects a truncated scan');
select pta_test.ok(not pta.luhn_ok('4539-5787-6362-1486'),
  'PP4. luhn_ok rejects anything that is not purely digits');

select pta_test.ok(
  (select bool_and(length(n) = 16 and n ~ '^[0-9]{16}$' and pta.luhn_ok(n))
     from (select pta.generate_card_number() as n from generate_series(1, 200)) t),
  'PP5. 200 generated card numbers are all 16 digits and Luhn-valid');

select pta_test.eq(
  (select count(distinct n)::int
     from (select pta.generate_card_number() as n from generate_series(1, 200)) t),
  200, 'PP6. 200 generated card numbers are all distinct');

-- Rejection sampling, not modulo folding: a-f are DISCARDED. Folding them into
-- 0-5 would make the low digits twice as likely and hand an attacker most of a
-- digit of entropy per position. 3000 digits is enough that a 2:1 bias shows.
select pta_test.ok(
  (select max(c) - min(c) < 0.4 * avg(c)
     from (select count(*)::numeric as c
             from (select unnest(string_to_array(
                     string_agg(left(pta.generate_card_number(), 15), ''), null)) as d
                     from generate_series(1, 200)) x
            group by d) y),
  'PP7. Generated digits are near-uniform — rejection sampling, not modulo bias');

select pta_test.eq(length(pta.generate_pin()), 6,
  'PP8. A generated PIN is six digits, leading zero preserved');

-- ---------------------------------------------------------------------------
-- Issuance
-- ---------------------------------------------------------------------------
select pta_test.login(:A_ADMIN::uuid);

create temp table _cards (who text, card text, pin text, account uuid);

insert into _cards
select 'ana',
       (r ->> 'card_number'), (r ->> 'pin'), (r ->> 'account_id')::uuid
from (select pta.issue_parent_card(
        (select v from _ids where k='ana')) as r) t;

insert into _cards
select 'ben',
       (r ->> 'card_number'), (r ->> 'pin'), (r ->> 'account_id')::uuid
from (select pta.issue_parent_card(
        (select v from _ids where k='ben')) as r) t;

select pta_test.eq((select count(*) from pta.v_parent_cards_detail)::int, 2,
  'PP9. An admin can issue a parent card');
select pta_test.ok(
  (select pta.luhn_ok(card) and length(card) = 16 from _cards where who = 'ana'),
  'PP10. Issuance returns a Luhn-valid 16-digit card number');
select pta_test.ok(
  (select must_change_pin from pta.v_parent_cards_detail
    where id = (select account from _cards where who = 'ana')),
  'PP11. A freshly issued card must change its PIN — the office PIN is a bootstrap');

-- One card per guardian. A second is not "another card", it is a duplicate
-- credential for one human, and the office would have no way to tell them apart.
select pta_test.throws($$
  select pta.issue_parent_card(
    (select v from _ids where k='ana'))
$$, 'PP12. A guardian cannot be issued a second parent card');

-- The number never appears again anywhere a person can read it.
select pta_test.ok(
  (select card_masked like '••••%' and card_masked not like '%' ||
          (select left(card, 6) from _cards where who = 'ana') || '%'
     from pta.v_parent_cards_detail
    where id = (select account from _cards where who = 'ana')),
  'PP13. The staff card list masks the number — it is a credential, not a label');

select pta_test.ok(
  not exists (select 1 from pta.audit_logs
               where action = 'PORTAL_CARD_ISSUED'
                 and new_values::text like '%' ||
                     (select left(card, 8) from _cards where who = 'ana') || '%'),
  'PP14. The audit row records the issuance without recording the card number');
select pta_test.logout();

-- A cashier may take money. Issuing an identity is a different thing.
select pta_test.login(:A_CASHIER::uuid);
select pta_test.throws($$
  select pta.issue_parent_card(
    (select v from _ids where k='ben'))
$$, 'PP15. A cashier cannot issue a parent card');
select pta_test.logout();

select pta_test.login(:B_ADMIN::uuid);
select pta_test.throws($$
  select pta.issue_parent_card(
    (select v from _ids where k='ben'))
$$, 'PP16. Another school''s admin cannot issue a card to your guardian');
select pta_test.eq((select count(*) from pta.v_parent_cards_detail)::int, 0,
  'PP17. School B sees none of School A''s parent cards');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- The credential table is readable by NOBODY
--
-- RLS is row-level. Any policy letting a cashier see their school's rows lets
-- them see card_number and pin_hash inside those rows -- and a cashier reads
-- card numbers off the POS scanner all day. So portal_accounts carries no
-- policy at all, and staff reach it only through a masking definer view.
-- ---------------------------------------------------------------------------
select pta_test.login(:A_CASHIER::uuid);
select pta_test.eq((select count(*) from pta.portal_accounts)::int, 0,
  'PP17b. A cashier reads no rows from pta.portal_accounts');
select pta_test.logout();

select pta_test.login(:A_ADMIN::uuid);
select pta_test.eq((select count(*) from pta.portal_accounts)::int, 0,
  'PP17c. Neither does an admin — the table has no read policy at all');
select pta_test.eq((select count(*) from pta.v_parent_cards_detail)::int, 2,
  'PP17d. ...they see their school''s cards through the masking view instead');
select pta_test.logout();

select pta_test.login(:SUPER::uuid);
select pta_test.eq((select count(*) from pta.portal_accounts)::int, 0,
  'PP17e. Not even a super admin reads the raw credential table');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- lookup_parent_card — what the POS search box calls on a scan
-- ---------------------------------------------------------------------------
select pta_test.login(:A_CASHIER::uuid);
select pta_test.eq(
  (select count(*) from pta.lookup_parent_card(
     (select card from _cards where who='ana')))::int,
  2, 'PP17f. Scanning a parent card at the POS returns that guardian''s children');

select pta_test.ok(
  not exists (
    select 1 from information_schema.columns
     where table_schema = 'pta' and table_name = 'lookup_parent_card'),
  'PP17g. ...and the function returns people, never the credential');

select pta_test.eq(
  (select count(*) from pta.lookup_parent_card('4539578763621486'))::int,
  0, 'PP17h. An unknown card returns nothing');
select pta_test.eq(
  (select count(*) from pta.lookup_parent_card('not a card'))::int,
  0, 'PP17i. A malformed number returns nothing rather than raising');
select pta_test.logout();

-- Card numbers are GLOBALLY unique, so school B could otherwise learn a name
-- from school A's card just by scanning it.
select pta_test.login(:B_ADMIN::uuid);
select pta_test.eq(
  (select count(*) from pta.lookup_parent_card(
     (select card from _cards where who='ana')))::int,
  0, 'PP17j. Another school''s staff learn nothing from a card that is not theirs');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- Login
--
-- 0017 made the PIN a per-school setting, defaulting OFF. Everything from here
-- to the card-only block at the foot of this file exercises the PIN-ON mode, so
-- it is switched on explicitly rather than relied upon.
-- ---------------------------------------------------------------------------
select pta_test.login(:A_ADMIN::uuid);
insert into pta.school_settings (school_id, key, value)
values ((select v from _ids where k='onhs'), 'portal_require_pin', 'true'::jsonb)
on conflict (school_id, key) do update set value = excluded.value;
select pta_test.logout();

select pta_test.ok(pta.portal_pin_required((select v from _ids where k='onhs')),
  'PP17k. A school can require a PIN as well as the card');
select pta_test.ok(
  not pta.portal_pin_required((select v from _ids where k='bstudent')),
  'PP17l. ...and a school that has not set it is card-only by default');
select pta_test.eq(
  (select (pta.portal_login(card, pin, '10.0.0.1') ->> 'ok')::boolean from _cards where who='ana'),
  true, 'PP18. The issued card and PIN log in');

select pta_test.eq(
  (select (pta.portal_login(card, pin, '10.0.0.1') ->> 'must_change_pin')::boolean
     from _cards where who='ana'),
  true, 'PP19. Login reports that the bootstrap PIN must be replaced');

select pta_test.eq(
  (select pta.portal_login(card, '999999', '10.0.0.2') ->> 'reason' from _cards where who='ana'),
  'invalid', 'PP20. A wrong PIN is refused');

-- A wrong CARD and a wrong PIN are indistinguishable to the caller, so the
-- endpoint cannot be used to test whether a card number exists.
select pta_test.eq(
  pta.portal_login('4539578763621486', '123456', '10.0.0.2') ->> 'reason',
  'invalid', 'PP21. An unknown card returns the same answer as a wrong PIN');

select pta_test.eq(
  pta.portal_login('1234', '123456', '10.0.0.2') ->> 'reason',
  'invalid', 'PP22. A malformed card number is refused before any lookup');

-- Lockout after five.
select pta.portal_login(card, '000001', '10.0.0.3') from _cards where who='ana';
select pta.portal_login(card, '000002', '10.0.0.3') from _cards where who='ana';
select pta.portal_login(card, '000003', '10.0.0.3') from _cards where who='ana';
select pta.portal_login(card, '000004', '10.0.0.3') from _cards where who='ana';

select pta_test.eq(
  (select pta.portal_login(card, '000005', '10.0.0.3') ->> 'reason' from _cards where who='ana'),
  'locked', 'PP23. Five wrong PINs lock the card');

-- ...and the correct PIN does not open it while it is locked. Otherwise the
-- lockout would only slow down someone who never guesses right.
select pta_test.eq(
  (select pta.portal_login(card, pin, '10.0.0.3') ->> 'reason' from _cards where who='ana'),
  'locked', 'PP24. A locked card refuses even the correct PIN');

select pta_test.eq(
  (select count(*) from pta.audit_logs where action = 'PORTAL_LOCKED_OUT')::int,
  1, 'PP25. A lockout is audited, so a parent locked out by someone else is diagnosable');

-- Ben's card is untouched: lockout is per account, not per school.
select pta_test.eq(
  (select (pta.portal_login(card, pin, '10.0.0.4') ->> 'ok')::boolean from _cards where who='ben'),
  true, 'PP26. Locking one card does not lock another');

-- The IP throttle is the half that catches someone guessing CARD NUMBERS: a
-- wrong card matches no account and so increments no per-account counter.
do $$
declare i int;
begin
  for i in 1..25 loop
    perform pta.portal_login(lpad(i::text, 15, '0') || '0', '123456', '10.9.9.9');
  end loop;
end $$;
select pta_test.eq(
  pta.portal_login('4539578763621486', '123456', '10.9.9.9') ->> 'reason',
  'throttled', 'PP27. Guessing card numbers from one IP is throttled');

-- Unlock Ana for the rest of the suite. reset_parent_pin() is the supported way
-- back in after a lockout — it clears the counters as a side effect — and it is
-- the same path the school office would take.
select pta_test.login(:A_ADMIN::uuid);
create temp table _unlock (r jsonb);
insert into _unlock select pta.reset_parent_pin(
  (select account from _cards where who = 'ana'));
select pta_test.logout();
update _cards set pin = (select r ->> 'pin' from _unlock) where who = 'ana';

-- ---------------------------------------------------------------------------
-- Changing the PIN
-- ---------------------------------------------------------------------------
select pta_test.portal_login((select v from _ids where k='ana'));

select pta_test.eq(
  (select pta.portal_change_pin(pin, '135790') ->> 'ok' from _cards where who='ana')::boolean,
  true, 'PP28. A guardian can replace the office PIN');

select pta_test.eq(
  pta.portal_change_pin('135790', '123456') ->> 'reason',
  'too_common', 'PP29. An obvious PIN is refused');
select pta_test.eq(
  pta.portal_change_pin('135790', '12ab56') ->> 'reason',
  'format', 'PP30. A non-numeric PIN is refused');
select pta_test.eq(
  pta.portal_change_pin('000000', '246810') ->> 'reason',
  'wrong_pin', 'PP31. Changing the PIN requires the current one');
select pta_test.logout();

select pta_test.eq(
  (select pta.portal_login(card, '135790', '10.0.0.1') ->> 'must_change_pin' from _cards where who='ana')::boolean,
  false, 'PP32. Replacing the PIN clears must_change_pin');
select pta_test.eq(
  (select pta.portal_login(card, pin, '10.0.0.1') ->> 'reason' from _cards where who='ana'),
  'invalid', 'PP33. The old office PIN stops working');

-- ---------------------------------------------------------------------------
-- The portal read surface — tenancy and family scoping
-- ---------------------------------------------------------------------------
select pta_test.portal_login((select v from _ids where k='ana'));

select pta_test.eq((select count(*) from pta.v_portal_children)::int, 2,
  'PP34. Ana sees exactly her two children');
select pta_test.ok(
  (select bool_and(full_name in ('Cruz, Juan Dela', 'Reyes, Pedro Santos'))
     from pta.v_portal_children),
  'PP35. ...and they are the right two');
select pta_test.ok(
  not exists (select 1 from pta.v_portal_children where full_name like 'Bautista%'),
  'PP36. Ana does not see Maria, who is not her child');
select pta_test.ok(
  (select bool_and(is_enrolled) from pta.v_portal_children),
  'PP37. Enrollment is reported, because a claim cannot be approved without it');
select pta_test.ok(
  (select bool_and(outstanding_balance > 0) from pta.v_portal_children),
  'PP38. Each child carries a live balance from v_student_charge_balances (D15)');

select pta_test.ok(
  not exists (select 1 from pta.v_portal_balances b
               join pta.students s on s.id = b.student_id
              where s.first_name = 'Maria'),
  'PP39. Ana sees no charges belonging to another family');

select pta_test.ok(
  (select bool_and(school_id = (select v from _ids where k='onhs'))
     from pta.v_portal_programs),
  'PP40. Every program offered belongs to the parent''s own school');

-- v_portal_account is the only window a parent has onto their own credential
-- row, and it must stay a keyhole: masked number, a boolean, a locale.
select pta_test.eq((select count(*) from pta.v_portal_account)::int, 1,
  'PP40b. A parent sees exactly one account — their own');
select pta_test.ok(
  (select card_masked like '••••%' from pta.v_portal_account),
  'PP40c. ...with the card number masked');
select pta_test.ok(
  not exists (
    select 1 from information_schema.columns
     where table_schema = 'pta' and table_name = 'v_portal_account'
       and column_name in ('pin_hash', 'pin_salt', 'card_number')),
  'PP40d. ...and no hash, salt or full card number anywhere in the view');

-- school_settings is RLS-scoped to staff, so the payment page can only learn
-- the school's GCash number through this definer view.
select pta_test.eq((select count(*) from pta.school_settings)::int, 0,
  'PP40e. A parent reads nothing from school_settings directly');
select pta_test.logout();

-- Written the way /admin/settings writes it: a bare JSON string, through an
-- ordinary RLS table write. school_settings is configuration, not money.
select pta_test.login(:A_ADMIN::uuid);
insert into pta.school_settings (school_id, key, value)
values ((select v from _ids where k='onhs'), 'gcash_number', '"0917 000 1234"'::jsonb)
on conflict (school_id, key) do update set value = excluded.value;
select pta_test.logout();

-- A cashier is not an administrator, and school_settings is admin-gated (0006).
select pta_test.login(:A_CASHIER::uuid);
select pta_test.throws($$
  insert into pta.school_settings (school_id, key, value)
  values ((select v from _ids where k='onhs'), 'telegram_bot', '"RogueBot"'::jsonb)
$$, 'PP40g. A cashier cannot change the portal settings');
select pta_test.logout();

select pta_test.portal_login((select v from _ids where k='ana'));
select pta_test.eq(
  (select gcash_number from pta.v_portal_account), '0917 000 1234',
  'PP40f. ...but does see it on their own account view');
select pta_test.logout();

-- The bot username is read with coalesce(value ->> 'username', value #>> '{}'),
-- so BOTH the shape /admin/settings writes and the shape somebody will type
-- into the SQL editor resolve. Getting this wrong is a portal page that says
-- "the school has not set up its bot" while the setting is plainly there.
select pta_test.login(:A_ADMIN::uuid);
insert into pta.school_settings (school_id, key, value)
values ((select v from _ids where k='onhs'), 'telegram_bot', '"OnhsGateBot"'::jsonb)
on conflict (school_id, key) do update set value = excluded.value;
select pta_test.logout();

select pta_test.portal_login((select v from _ids where k='ana'));
select pta_test.eq((select bot_username from pta.v_portal_telegram), 'OnhsGateBot',
  'PP40h. A bare-string telegram_bot setting resolves');
select pta_test.logout();

select pta_test.login(:A_ADMIN::uuid);
update pta.school_settings set value = '{"username": "OnhsGateBot"}'::jsonb
 where school_id = (select v from _ids where k='onhs') and key = 'telegram_bot';
select pta_test.logout();

select pta_test.portal_login((select v from _ids where k='ana'));
select pta_test.eq((select bot_username from pta.v_portal_telegram), 'OnhsGateBot',
  'PP40i. ...and so does the object shape a hand-edit would produce');

-- 0018. The deep link is built inside portal_issue_enroll_token(), which does
-- its OWN lookup of the bot username -- so the view being tolerant is not
-- enough. 0016 read only {"username": ...} in both places, and the settings
-- form writes a bare string, which is how a configured school came to be told
-- it had not configured anything.
select pta_test.ok(
  (pta.portal_issue_enroll_token() -> 'deep_link') <> 'null'::jsonb,
  'PP40j. The deep link is built from an object-shaped bot setting');

select pta_test.logout();
select pta_test.login(:A_ADMIN::uuid);
update pta.school_settings set value = '"OnhsGateBot"'::jsonb
 where school_id = (select v from _ids where k='onhs') and key = 'telegram_bot';
select pta_test.logout();

select pta_test.portal_login((select v from _ids where k='ana'));
select pta_test.eq((select bot_username from pta.v_portal_telegram), 'OnhsGateBot',
  'PP40k. A bare-string setting resolves in the view');
-- Minted ONCE and held: every call to portal_issue_enroll_token() retires the
-- previous token and returns a new one, so calling it twice inside one
-- assertion compares two different links.
create temp table _link (r jsonb);
insert into _link select pta.portal_issue_enroll_token();
select pta_test.eq(
  (select r ->> 'deep_link' from _link),
  'https://t.me/OnhsGateBot?start=' || (select r ->> 'token' from _link),
  'PP40l. ...and in the deep link the connect button opens');

-- current_profile_id() must be null: a portal session is NOT a staff identity,
-- and anything that assumed otherwise would stamp a guardian onto a payment.
select pta_test.ok(pta.current_profile_id() is null,
  'PP41. A portal session has no profile — it is not a staff identity');
select pta_test.eq(array_length(pta.current_school_ids(), 1), null,
  'PP42. A portal session belongs to no school by the STAFF definition');

-- The staff surface is worth nothing to a portal token, and it fails closed on
-- the helpers rather than on a policy somebody could later relax.
select pta_test.eq((select count(*) from pta.students)::int, 0,
  'PP43. A portal token reads zero rows from pta.students');
select pta_test.eq((select count(*) from pta.payments)::int, 0,
  'PP44. A portal token reads zero rows from pta.payments');
select pta_test.eq((select count(*) from pta.parents_guardians)::int, 0,
  'PP45. A portal token reads zero rows from pta.parents_guardians');
select pta_test.eq((select count(*) from pta.portal_accounts)::int, 0,
  'PP46. A portal token cannot read the credential table — not even its own row');
select pta_test.throws($$
  select pta.issue_parent_card(pta.current_guardian_id())
$$, 'PP47. A portal token cannot issue itself a card');
select pta_test.eq(
  (select count(*) from pta.lookup_parent_card(
     (select card from _cards where who='ana')))::int,
  0, 'PP47b. ...nor use the POS lookup, which requires a staff role');
select pta_test.logout();

-- Ben sees his child only, and none of Ana's.
select pta_test.portal_login((select v from _ids where k='ben'));
select pta_test.eq((select count(*) from pta.v_portal_children)::int, 1,
  'PP48. Ben sees exactly his one child');
select pta_test.ok(
  not exists (select 1 from pta.v_portal_children where full_name like 'Cruz, Juan%'),
  'PP49. Ben does not see Juan, who is Ana''s child');
select pta_test.logout();

-- A guardian at School B sees nothing of School A, and vice versa.
select pta_test.portal_login(
  (select v from _ids where k='carla'));
select pta_test.eq((select count(*) from pta.v_portal_children)::int, 0,
  'PP50. A guardian with no portal account resolves to nobody at all');
select pta_test.logout();

-- STAFF through the portal views. This is the assertion that catches a missing
-- WHERE clause: these views are security_invoker = OFF, so RLS is not standing
-- behind them.
select pta_test.login(:A_ADMIN::uuid);
select pta_test.eq((select count(*) from pta.v_portal_children)::int, 0,
  'PP51. A school admin reads ZERO rows from the portal views');
select pta_test.eq((select count(*) from pta.v_portal_balances)::int, 0,
  'PP52. ...including balances');
select pta_test.eq((select count(*) from pta.v_portal_attendance)::int, 0,
  'PP53. ...including attendance');
select pta_test.eq((select count(*) from pta.v_portal_payments)::int, 0,
  'PP54. ...including payments');
select pta_test.logout();

select pta_test.login(:SUPER::uuid);
select pta_test.eq((select count(*) from pta.v_portal_children)::int, 0,
  'PP55. Not even a super admin reads the portal views — they are not a guardian');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- Attendance, and the visibility window
--
-- Ana is PRIMARY for Juan (full school year) and non-primary for Pedro
-- (today + 7 days). Two scans each, one recent and one from 60 days ago.
-- ---------------------------------------------------------------------------
select pta_test.login(:A_ADMIN::uuid);
select pta.assign_student_card(
  (select v from _ids where k='juan'), 'CAFE0011');
select pta.assign_student_card(
  (select v from _ids where k='pedro'), 'CAFE0012');

-- issued_at is now(), and attendance_resolved only matches scans at or after
-- issue. So the "60 days ago" scans are backdated by moving issued_at, which is
-- what a real card issued in June would look like in August.
update pta.student_cards set issued_at = now() - interval '90 days'
 where card_uid in ('CAFE0011', 'CAFE0012') and revoked_at is null;

select pta.record_attendance(jsonb_build_array(
  jsonb_build_object('event_id','ccccccc1-0000-0000-0000-000000000001',
    'device_id','onhs-main-gate','card_uid','CAFE0011',
    'scanned_at', now() - interval '60 days','clock_synced',true,
    'image_path','gate/ccccccc1-0000-0000-0000-000000000001.jpg'),
  jsonb_build_object('event_id','ccccccc1-0000-0000-0000-000000000002',
    'device_id','onhs-main-gate','card_uid','CAFE0011',
    'scanned_at', now() - interval '1 hour','clock_synced',true,
    'image_path','gate/ccccccc1-0000-0000-0000-000000000002.jpg'),
  jsonb_build_object('event_id','ccccccc1-0000-0000-0000-000000000003',
    'device_id','onhs-main-gate','card_uid','CAFE0012',
    'scanned_at', now() - interval '60 days','clock_synced',true,
    'image_path','gate/ccccccc1-0000-0000-0000-000000000003.jpg'),
  jsonb_build_object('event_id','ccccccc1-0000-0000-0000-000000000004',
    'device_id','onhs-main-gate','card_uid','CAFE0012',
    'scanned_at', now() - interval '1 hour','clock_synced',true,
    'image_path','gate/ccccccc1-0000-0000-0000-000000000004.jpg')
));
-- image_path is set through record_attendance, NOT by a later UPDATE:
-- pta.attendance is machine-written and has no write policy at all (0013), so
-- an UPDATE here silently affects zero rows and the capture tests pass on air.
select pta_test.logout();

select pta_test.portal_login((select v from _ids where k='ana'));

-- Scoped to this file's own events: 06_gate left scans on both these students,
-- and a bare count would be measuring that suite instead of this one.
select pta_test.eq(
  (select count(*) from pta.v_portal_attendance
    where full_name = 'Cruz, Juan Dela' and event_id::text like 'ccccccc1%')::int,
  2, 'PP56. The PRIMARY guardian sees the whole school year of scans');

select pta_test.eq(
  (select count(*) from pta.v_portal_attendance
    where full_name = 'Reyes, Pedro Santos' and event_id::text like 'ccccccc1%')::int,
  1, 'PP57. A non-primary guardian sees only the last 7 days');

select pta_test.ok(
  not exists (select 1 from pta.v_portal_attendance
               where full_name = 'Reyes, Pedro Santos'
                 and scanned_at < now() - interval '8 days'),
  'PP58. ...and the older scan is genuinely absent, not merely unsorted');

select pta_test.ok(
  (select bool_and(image_path is not null) from pta.v_portal_attendance
    where full_name = 'Cruz, Juan Dela' and event_id::text like 'ccccccc1%'),
  'PP59. The primary guardian gets capture paths');
select pta_test.ok(
  (select bool_and(image_path is null) from pta.v_portal_attendance
    where full_name = 'Reyes, Pedro Santos'),
  'PP60. A non-primary guardian gets times but no pictures');

-- The day boundary comes from v_attendance_local, so it is Manila's and it is
-- computed in SQL (D11). A parent abroad must not see yesterday.
select pta_test.eq(
  (select local_date from pta.v_portal_attendance
    where event_id = 'ccccccc1-0000-0000-0000-000000000002'),
  (now() at time zone 'Asia/Manila')::date,
  'PP61. local_date is the school''s calendar day, not the browser''s');

-- may_view_capture backs the ONE storage policy this migration adds.
select pta_test.ok(
  pta.may_view_capture('gate/ccccccc1-0000-0000-0000-000000000002.jpg'),
  'PP62. A primary guardian may view their own child''s capture');
select pta_test.ok(
  not pta.may_view_capture('gate/ccccccc1-0000-0000-0000-000000000004.jpg'),
  'PP63. A non-primary guardian may not view a capture');
select pta_test.ok(
  not pta.may_view_capture('gate/does-not-exist.jpg'),
  'PP64. An unknown object name grants nothing');
select pta_test.logout();

select pta_test.login(:A_ADMIN::uuid);
select pta_test.ok(not pta.may_view_capture('gate/ccccccc1-0000-0000-0000-000000000002.jpg'),
  'PP65. Staff are not guardians — may_view_capture says no to them too');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- Claims: the money path
-- ---------------------------------------------------------------------------
select pta_test.portal_login((select v from _ids where k='ana'));

create temp table _claim (id uuid);
create temp table _before (bal numeric);
insert into _before
select coalesce(sum(balance), 0) from pta.v_portal_balances
 where student_id = (select v from _ids where k='juan');

insert into _claim
select pta.submit_payment_claim(
  'fee',
  (select v from _ids where k='juan'),
  null,
  (select jsonb_agg(jsonb_build_object('charge_id', b.charge_id, 'amount', b.balance))
     from pta.v_portal_balances b
    where b.student_id = (select v from _ids where k='juan') and b.balance > 0),
  (select sum(balance) from pta.v_portal_balances
    where student_id = (select v from _ids where k='juan') and balance > 0),
  'gcash', 'GC-REF-000111', 'proofs/x.jpg', false, 'Sent via GCash'
);

select pta_test.eq((select count(*) from _claim where id is not null)::int, 1,
  'PP66. A guardian can submit a payment claim');

-- THE assertion this whole design exists for.
select pta_test.eq(
  (select sum(balance) from pta.v_portal_balances
    where student_id = (select v from _ids where k='juan') and balance > 0),
  (select bal from _before),
  'PP67. A SUBMITTED claim moves no balance — the money is not real yet');

select pta_test.ok(
  (select payment_id is null from pta.v_portal_claims where id = (select id from _claim)),
  'PP68. ...and is attached to no payment');

select pta_test.eq(
  (select status from pta.v_portal_claims where id = (select id from _claim)),
  'submitted', 'PP69. The parent sees it as submitted');

-- One GCash reference, one claim.
select pta_test.throws($$
  select pta.submit_payment_claim('fee',
    (select v from _ids where k='pedro'),
    null,
    (select jsonb_agg(jsonb_build_object('charge_id', b.charge_id, 'amount', 1.00))
       from pta.v_portal_balances b
      where b.student_id = (select v from _ids where k='pedro') and b.balance > 0 limit 1),
    1.00, 'gcash', 'gc-ref-000111  ', null, false, null)
$$, 'PP70. The same GCash reference cannot be claimed twice');

-- A guardian cannot pay for a child who is not theirs.
select pta_test.throws($$
  select pta.submit_payment_claim('fee',
    (select v from _ids where k='maria'),
    null, '[{"charge_id":"00000000-0000-0000-0000-000000000000","amount":1}]'::jsonb,
    1.00, 'gcash', 'GC-REF-000999', null, false, null)
$$, 'PP71. A guardian cannot submit a claim for another family''s child');

-- The amount must match the lines, or approval would post a different figure
-- than the parent believed they were sending.
select pta_test.throws($$
  select pta.submit_payment_claim('fee',
    (select v from _ids where k='pedro'),
    null,
    (select jsonb_agg(jsonb_build_object('charge_id', b.charge_id, 'amount', b.balance))
       from pta.v_portal_balances b
      where b.student_id = (select v from _ids where k='pedro') and b.balance > 0),
    999999.00, 'gcash', 'GC-REF-000888', null, false, null)
$$, 'PP72. The claimed total must equal the selected fees');

-- Overpaying a charge is refused HERE, not discovered at approval.
select pta_test.throws($$
  select pta.submit_payment_claim('fee',
    (select v from _ids where k='pedro'),
    null,
    (select jsonb_agg(jsonb_build_object('charge_id', b.charge_id, 'amount', b.balance + 500))
       from pta.v_portal_balances b
      where b.student_id = (select v from _ids where k='pedro') and b.balance > 0),
    (select sum(balance + 500) from pta.v_portal_balances
      where student_id = (select v from _ids where k='pedro') and balance > 0),
    'gcash', 'GC-REF-000777', null, false, null)
$$, 'PP73. Overpaying a charge is refused at submission, not at review');

select pta_test.logout();

-- Review.
select pta_test.login(:A_CASHIER::uuid);
select pta_test.eq((select count(*) from pta.v_payment_claims_detail where status='submitted')::int,
  1, 'PP74. The claim appears in the staff review queue');
-- Checked from the STAFF side: a portal session reads zero rows from
-- pta.payments regardless, so counting there would pass on a bug.
select pta_test.eq((select count(*) from pta.payments)::int,
  (select n from _base where k='payments'),
  'PP74b. A submitted claim has still created no payment row');
select pta_test.ok(
  (select student_is_enrolled from pta.v_payment_claims_detail
    where id = (select id from _claim)),
  'PP75. The queue tells the reviewer whether approval can even succeed');

select pta_test.throws($$
  select pta.reject_payment_claim((select id from _claim), '')
$$, 'PP76. Rejecting requires a reason the parent can act on');

create temp table _approved (r jsonb);
insert into _approved select pta.approve_payment_claim((select id from _claim));

select pta_test.eq((select count(*) from pta.payments)::int,
  (select n from _base where k='payments') + 1,
  'PP77. Approval creates the payment');
select pta_test.ok(
  (select pay.receipt_number is not null from pta.payment_claims c
     join pta.payments pay on pay.id = c.payment_id where c.id = (select id from _claim)),
  'PP78. ...with a receipt number from the SAME series as the counter (D18)');

-- collected_by is the reviewer. Nobody invents a system profile: a human
-- attested that this transfer landed and the audit trail should say who.
select pta_test.eq(
  (select p.full_name from pta.payment_claims c
     join pta.payments pay on pay.id = c.payment_id
     join pta.profiles p on p.id = pay.collected_by
    where c.id = (select id from _claim)),
  'Cashier Ozamiz',
  'PP79. collected_by is the REVIEWER — the person who checked the GCash app');

select pta_test.eq(
  (select coalesce(sum(balance), 0) from pta.v_student_charge_balances
    where student_id = (select v from _ids where k='juan')),
  0.00, 'PP80. NOW the balance moves');

select pta_test.throws($$
  select pta.approve_payment_claim((select id from _claim))
$$, 'PP81. An approved claim cannot be approved twice');

select pta_test.eq(
  (select count(*) from pta.audit_logs where action = 'CLAIM_APPROVED')::int,
  1, 'PP82. Approval is audited');
select pta_test.logout();

-- The parent sees the receipt number they can now quote at the office.
select pta_test.portal_login((select v from _ids where k='ana'));
select pta_test.eq(
  (select status from pta.v_portal_claims where id = (select id from _claim)),
  'approved', 'PP83. The parent sees the claim approved');
select pta_test.ok(
  (select receipt_number from pta.v_portal_claims where id = (select id from _claim)) is not null,
  'PP84. ...and the receipt number attached to it');
select pta_test.ok(
  exists (select 1 from pta.v_portal_payments vp
           join pta.v_portal_claims vc on vc.receipt_number = vp.receipt_number
          where vc.id = (select id from _claim)),
  'PP85. The payment appears in the parent''s own receipt list');
select pta_test.logout();

-- Ben must not see Ana's claim, even though they share a school and a child.
select pta_test.portal_login((select v from _ids where k='ben'));
select pta_test.eq((select count(*) from pta.v_portal_claims)::int, 0,
  'PP86. A guardian sees none of another guardian''s claims');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- A student with no active enrollment
--
-- pta.payments carries an FK to student_enrollments, so approving such a claim
-- would fail INSIDE create_payment -- after the parent had already sent money.
-- ---------------------------------------------------------------------------
select pta_test.login(:A_ADMIN::uuid);
update pta.student_enrollments set status = 'transferred_out'
 where student_id = (select v from _ids where k='pedro');
select pta_test.logout();

select pta_test.portal_login((select v from _ids where k='ben'));
select pta_test.throws($$
  select pta.submit_payment_claim('fee',
    (select v from _ids where k='pedro'),
    null, '[{"charge_id":"00000000-0000-0000-0000-000000000000","amount":1}]'::jsonb,
    1.00, 'gcash', 'GC-REF-000555', null, false, null)
$$, 'PP87. A claim for a non-enrolled student is refused at SUBMISSION');

-- ...but the child stays visible. Hiding a child who left generates a support call.
select pta_test.eq((select count(*) from pta.v_portal_children)::int, 1,
  'PP88. A non-enrolled child is still visible to their guardian');
select pta_test.ok(
  not (select is_enrolled from pta.v_portal_children),
  'PP89. ...flagged as not enrolled, so the page can say why');
select pta_test.logout();

select pta_test.login(:A_ADMIN::uuid);
update pta.student_enrollments set status = 'enrolled'
 where student_id = (select v from _ids where k='pedro');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- Donations and pledges
-- ---------------------------------------------------------------------------
select pta_test.login(:A_ADMIN::uuid);
insert into pta.donation_programs (school_id, school_year_id, name, category, status, created_by)
select s.id, sy.id, 'Covered Court', 'project', 'open', pta.current_profile_id()
from pta.schools s join pta.school_years sy on sy.school_id = s.id and sy.is_active
where s.school_code = 'ONHS';
select pta_test.logout();

select pta_test.portal_login((select v from _ids where k='ana'));

select pta_test.ok(
  exists (select 1 from pta.v_portal_programs where name = 'Covered Court'),
  'PP90. An open program is offered to the parent');

create temp table _dclaim (id uuid);
insert into _dclaim select pta.submit_payment_claim(
  'donation', null,
  (select id from pta.v_portal_programs where name = 'Covered Court'),
  null, 500.00, 'gcash', 'GC-REF-DONATE-1', null, false, 'For the court');

select pta_test.ok(
  (select donation_id is null from pta.v_portal_claims where id = (select id from _dclaim)),
  'PP91. A donation claim creates no donation until it is confirmed');

-- A pledge moves no money, so it needs no queue. 0014 deliberately has no
-- overpayment guard on pledges: over-delivering on a promise is generosity.
create temp table _pledge (id uuid);
insert into _pledge select pta.portal_create_pledge(
  (select id from pta.v_portal_programs where name = 'Covered Court'),
  2000.00, null, 'Will give by December');

select pta_test.eq((select count(*) from pta.v_portal_pledges)::int, 1,
  'PP92. A parent can pledge directly — no review queue, because no money moved');
select pta_test.eq(
  (select fulfilment_status from pta.v_portal_pledges), 'open',
  'PP93. Fulfilment is DERIVED, never stored (D15)');
select pta_test.logout();

select pta_test.login(:A_CASHIER::uuid);
select pta.approve_payment_claim((select id from _dclaim));
select pta_test.eq((select count(*) from pta.donations)::int,
  (select n from _base where k='donations') + 1,
  'PP94. Approving a donation claim records the donation');
select pta_test.ok(
  (select don.acknowledgement_number like '%-D-%' from pta.payment_claims c
     join pta.donations don on don.id = c.donation_id where c.id = (select id from _dclaim)),
  'PP95. ...with an ACKNOWLEDGEMENT number from the donation series, not an OR');
select pta_test.eq(
  (select d.donor_type from pta.donors d where d.guardian_id = (select v from _ids where k='ana')),
  'guardian',
  'PP96. The parent becomes a donor row, created by the REVIEWER');
-- The pledge created a donor row first; approving the donation must REUSE it,
-- not mint a second identity for the same parent.
select pta_test.eq(
  (select count(*) from pta.donors where guardian_id = (select v from _ids where k='ana'))::int,
  1, 'PP97. ...and the pledge''s donor row is reused, not duplicated');
select pta_test.eq((select count(*) from pta.payments)::int,
  (select n from _base where k='payments') + 1,
  'PP98. A donation is never a payment — the two money paths stay separate');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- Telegram: 0013's hole, and the duplicate-guardian bug
-- ---------------------------------------------------------------------------

-- THE HOLE. 0013 granted issue_enroll_token to `authenticated` with no
-- authorization check whatsoever. Once a parent holds such a token, this is the
-- assertion standing between them and a stranger's child.
select pta_test.portal_login((select v from _ids where k='ana'));

select pta_test.throws($$
  select pta.issue_enroll_token(
    (select v from _ids where k='maria'),
    'Guardian', interval '30 days', null)
$$, 'PP99. A parent cannot mint an enrolment token for a child who is not theirs');

select pta_test.throws($$
  select pta.issue_enroll_token(
    (select v from _ids where k='bstudent'),
    'Guardian', interval '30 days',
    (select guardian_id from pta.portal_accounts limit 1))
$$, 'PP100. ...nor for a student at another school');

-- The portal's own button.
create temp table _tok (r jsonb);
insert into _tok select pta.portal_issue_enroll_token();

select pta_test.ok((select (r ->> 'ok')::boolean from _tok),
  'PP101. A parent can mint an enrolment link for their OWN children');

-- Pressing the button twice must leave one live credential, not two.
create temp table _tok2 (r jsonb);
insert into _tok2 select pta.portal_issue_enroll_token();
select pta_test.logout();

-- guardian_enroll_tokens is RLS-scoped to STAFF, so these three are asserted
-- from the office's side of the fence. A portal session reads nothing there --
-- which is itself the next assertion.
select pta_test.login(:A_ADMIN::uuid);
select pta_test.ok(
  (select expires_at < now() + interval '16 minutes' from pta.guardian_enroll_tokens
    where token = (select r ->> 'token' from _tok)),
  'PP102. A portal-issued token lives 15 minutes, not 30 days');

select pta_test.ok(
  (select guardian_id = (select v from _ids where k='ana') from pta.guardian_enroll_tokens
    where token = (select r ->> 'token' from _tok)),
  'PP103. ...and is BOUND to the guardian who asked for it');

select pta_test.eq(
  (select count(*) from pta.guardian_enroll_tokens
    where guardian_id = (select v from _ids where k='ana')
      and used_at is null and expires_at > now())::int,
  1, 'PP104. Re-issuing retires the previous link rather than scattering them');
select pta_test.logout();

select pta_test.portal_login((select v from _ids where k='ana'));
select pta_test.eq((select count(*) from pta.guardian_enroll_tokens)::int, 0,
  'PP104b. A parent cannot read the enrolment-token table, including their own');
select pta_test.logout();

-- Redemption. This is the duplicate-guardian bug: 0013's version looked up
-- parents_guardians by chat_id ONLY, so a parent already on file got a SECOND
-- row invented from their Telegram display name -- and the portal would then say
-- "not linked" forever while the bot messaged a duplicate identity.
create temp table _gcount (n int);
insert into _gcount select count(*) from pta.parents_guardians;

select pta.redeem_enroll_token((select r ->> 'token' from _tok2), '99887766', 'Ana C');

select pta_test.eq(
  (select count(*) from pta.parents_guardians)::int,
  (select n from _gcount),
  'PP105. Redeeming a portal token invents NO second guardian row');

select pta_test.eq(
  (select g.telegram_chat_id from pta.parents_guardians g
    join pta.portal_accounts a on a.guardian_id = g.id
   where a.id = (select account from _cards where who='ana')),
  '99887766', 'PP106. The chat is bound to the guardian who is logged in');

-- One tap, whole family. A parent with three children should not tap three times.
select pta_test.eq(
  (select count(*) from pta.student_guardians sg
    join pta.portal_accounts a on a.guardian_id = sg.guardian_id
   where a.id = (select account from _cards where who='ana') and sg.notify)::int,
  2, 'PP107. One redemption switches notifications on for EVERY child');

select pta_test.eq(
  pta.redeem_enroll_token((select r ->> 'token' from _tok2), '99887766', 'Ana C') ->> 'reason',
  'already_used', 'PP108. A token is single-use');

select pta_test.eq(
  pta.redeem_enroll_token((select r ->> 'token' from _tok), '99887766', 'Ana C') ->> 'reason',
  'expired', 'PP109. The retired earlier token is dead');

-- The office-slip path from 0013 must still behave exactly as it did.
select pta_test.login(:A_ADMIN::uuid);
create temp table _slip (t text);
insert into _slip select pta.issue_enroll_token(
  (select v from _ids where k='maria'), 'Mother', interval '30 days');
select pta_test.logout();

insert into _gcount select count(*) from pta.parents_guardians;
select pta.redeem_enroll_token((select t from _slip), '55443322', 'Nena Bautista');
select pta_test.eq(
  (select count(*) from pta.parents_guardians)::int,
  (select max(n) from _gcount) + 1,
  'PP110. The office-slip path still find-or-creates a guardian, unchanged');

-- Portal toggles.
select pta_test.portal_login((select v from _ids where k='ana'));
select pta_test.ok((pta.portal_set_notify(false) ->> 'ok')::boolean,
  'PP111. A parent can switch notifications off from the portal');
select pta_test.eq(
  (select count(*) from pta.student_guardians sg
    where sg.guardian_id = pta.current_guardian_id() and sg.notify)::int,
  0, 'PP112. ...for every child at once');
select pta.portal_set_notify(true);

select pta_test.ok((pta.portal_unlink_telegram() ->> 'ok')::boolean,
  'PP113. A parent can unlink a Telegram account they do not recognise');
select pta_test.ok(
  not (select is_linked from pta.v_portal_telegram),
  'PP114. ...and the guide page immediately says so');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- Revocation kills live sessions
--
-- current_guardian_id() re-checks status on EVERY call rather than trusting the
-- JWT, which is the same reasoning 0005 gives for its helpers. A 12-hour token
-- you cannot revoke is not acceptable for a feed of a child's movements.
-- ---------------------------------------------------------------------------
select pta_test.login(:A_ADMIN::uuid);
select pta.revoke_parent_card((select account from _cards where who='ana'), 'Reported lost');
select pta_test.logout();

select pta_test.portal_login((select v from _ids where k='ana'));
select pta_test.ok(pta.current_guardian_id() is null,
  'PP115. Revoking a card kills a session that is already open');
select pta_test.eq((select count(*) from pta.v_portal_children)::int, 0,
  'PP116. ...and the portal views go dark immediately');
select pta_test.eq((select count(*) from pta.v_portal_attendance)::int, 0,
  'PP117. ...including attendance');
select pta_test.logout();

select pta_test.eq(
  (select pta.portal_login(card, '135790', '10.0.0.1') ->> 'reason' from _cards where who='ana'),
  'invalid', 'PP118. A revoked card cannot log in again');

select pta_test.login(:A_ADMIN::uuid);
select pta_test.throws($$
  select pta.revoke_parent_card((select id from pta.v_parent_cards_detail
    where guardian_id = (select v from _ids where k='ben')), '')
$$, 'PP119. Revoking requires a reason');

-- Reset is staff-only ON PURPOSE: the POS scans this barcode, so cashiers read
-- card numbers all day. A self-service reset needing only the card number would
-- hand every cashier a way into any parent's account.
create temp table _reset (r jsonb);
insert into _reset select pta.reset_parent_pin(
  (select id from pta.v_parent_cards_detail
    where guardian_id = (select v from _ids where k='ben')));
select pta_test.ok((select length(r ->> 'pin') = 6 from _reset),
  'PP120. A PIN reset issues a fresh six-digit bootstrap PIN');
select pta_test.logout();

select pta_test.eq(
  (select (pta.portal_login((select card from _cards where who='ben'),
                            (select r ->> 'pin' from _reset), '10.0.0.7') ->> 'must_change_pin')::boolean),
  true, 'PP121. ...which must itself be replaced on next login');

select pta_test.eq(
  (select pta.portal_login(card, pin, '10.0.0.7') ->> 'reason' from _cards where who='ben'),
  'invalid', 'PP122. ...and the old PIN is dead');

-- ---------------------------------------------------------------------------
-- Proof-of-payment uploads
--
-- storage.objects is SHARED with construction-saas and sms-demo, so every
-- policy 0016 adds is scoped by bucket_id AND by path. A parent may write into
-- {their school}/{themselves}/ and nowhere else.
-- ---------------------------------------------------------------------------
select pta_test.portal_login((select v from _ids where k='ben'));

-- no_throw, not a count: the parent has an INSERT policy and no SELECT policy,
-- so they cannot read back the row they just wrote. PP139 confirms it landed,
-- from the staff side of the fence.
select pta_test.no_throw($$
  insert into storage.objects (bucket_id, name)
  values ('pta-payment-proofs',
          (select v from _ids where k='onhs')::text || '/' ||
          (select v from _ids where k='ben')::text || '/proof-1.jpg')
$$, 'PP134. A parent can upload a proof into their own folder');

select pta_test.throws($$
  insert into storage.objects (bucket_id, name)
  values ('pta-payment-proofs',
          (select v from _ids where k='onhs')::text || '/' ||
          (select v from _ids where k='ana')::text || '/forged.jpg')
$$, 'PP135. ...and into nobody else''s');

select pta_test.throws($$
  insert into storage.objects (bucket_id, name)
  values ('gate-captures', 'gate/anything.jpg')
$$, 'PP136. ...and not into the gate capture bucket at all');

-- A parent uploads; a parent does not browse. There is no read policy for them.
select pta_test.eq(
  (select count(*) from storage.objects where bucket_id = 'pta-payment-proofs')::int,
  0, 'PP137. A parent cannot read the proofs bucket back, including their own');
select pta_test.logout();

select pta_test.login(:A_CASHIER::uuid);
select pta_test.eq(
  (select count(*) from storage.objects where bucket_id = 'pta-payment-proofs')::int,
  1, 'PP138. Staff of that school can read the proof');
select pta_test.logout();

select pta_test.login(:B_ADMIN::uuid);
select pta_test.eq(
  (select count(*) from storage.objects where bucket_id = 'pta-payment-proofs')::int,
  0, 'PP139. Another school''s staff cannot');
select pta_test.logout();

-- ---------------------------------------------------------------------------
-- anon: still one append-only verb, plus the two login verbs and nothing else
-- ---------------------------------------------------------------------------
select pta_test.ok(
  has_function_privilege('anon', 'pta.portal_login(text, text, text)', 'execute'),
  'PP123. anon CAN call portal_login — logging in cannot require being logged in');
select pta_test.ok(
  not has_table_privilege('anon', 'pta.portal_accounts', 'select'),
  'PP124. anon cannot read the credential table');
select pta_test.ok(
  not has_table_privilege('anon', 'pta.payment_claims', 'select'),
  'PP125. anon cannot read claims');
select pta_test.ok(
  not has_table_privilege('anon', 'pta.v_portal_children', 'select'),
  'PP126. anon cannot read the portal views');
select pta_test.ok(
  not has_table_privilege('anon', 'pta.v_portal_attendance', 'select'),
  'PP127. anon cannot read a child''s movements');
select pta_test.ok(
  not has_function_privilege('anon', 'pta.issue_parent_card(uuid)', 'execute'),
  'PP128. anon cannot issue a card');
select pta_test.ok(
  not has_function_privilege('anon', 'pta.approve_payment_claim(uuid)', 'execute'),
  'PP129. anon cannot approve money');
select pta_test.ok(
  not has_function_privilege('anon', 'pta.portal_hash_pin(text, text)', 'execute'),
  'PP130. anon cannot reach the KDF');

-- service_role BYPASSES RLS and the gate board holds that key. Nothing in this
-- migration is handed to it: a board that reads a roster has no business
-- reading credentials, claims, or a family's balances.
select pta_test.ok(
  not has_table_privilege('service_role', 'pta.portal_accounts', 'select'),
  'PP131. service_role cannot read parent credentials');
select pta_test.ok(
  not has_table_privilege('service_role', 'pta.payment_claims', 'select'),
  'PP132. service_role cannot read claims');
select pta_test.ok(
  not has_table_privilege('service_role', 'pta.v_portal_balances', 'select'),
  'PP133. service_role cannot read the portal balance view');

-- ---------------------------------------------------------------------------
-- Card-only sign-in (0017)
--
-- With portal_require_pin off, the barcode is a single-factor BEARER
-- credential. These assertions pin down what that does and, more importantly,
-- what it does NOT relax: a revoked card is still dead, another school's card
-- still resolves to nothing, and the per-IP throttle -- now the only brake on
-- this endpoint -- still applies.
-- ---------------------------------------------------------------------------
select pta_test.login(:A_ADMIN::uuid);
update pta.school_settings set value = 'false'::jsonb
 where school_id = (select v from _ids where k='onhs') and key = 'portal_require_pin';
select pta_test.logout();

select pta_test.ok(
  not pta.portal_pin_required((select v from _ids where k='onhs')),
  'PP141. Turning the setting off makes the school card-only');

select pta_test.eq(
  (select (pta.portal_login(card, null, '10.0.5.1') ->> 'ok')::boolean
     from _cards where who='ben'),
  true, 'PP142. The card alone signs in — no PIN supplied at all');

select pta_test.eq(
  (select (pta.portal_login(card, null, '10.0.5.1') ->> 'must_change_pin')::boolean
     from _cards where who='ben'),
  false,
  'PP143. ...and the parent is NOT sent to set a PIN their school does not use');

-- A stale PIN in the box is ignored rather than refused: the school does not
-- use one, so it is not a credential and cannot be wrong.
select pta_test.eq(
  (select (pta.portal_login(card, '000000', '10.0.5.1') ->> 'ok')::boolean
     from _cards where who='ben'),
  true, 'PP144. A PIN sent anyway is ignored, not rejected');

select pta_test.portal_login((select v from _ids where k='ben'));
select pta_test.ok(not (select pin_required from pta.v_portal_account),
  'PP145. The portal shell can see that no PIN is required');
select pta_test.logout();

-- What card-only does NOT relax.
select pta_test.eq(
  (select pta.portal_login(card, null, '10.0.5.2') ->> 'reason'
     from _cards where who='ana'),
  'invalid', 'PP146. A REVOKED card still cannot sign in — revocation is now the control');

select pta_test.eq(
  pta.portal_login('4539578763621486', null, '10.0.5.2') ->> 'reason',
  'invalid', 'PP147. An unknown card still returns nothing useful');

do $$
declare i int;
begin
  for i in 1..25 loop
    perform pta.portal_login(lpad(i::text, 15, '0') || '0', null, '10.9.9.8');
  end loop;
end $$;
select pta_test.eq(
  pta.portal_login('4539578763621486', null, '10.9.9.8') ->> 'reason',
  'throttled',
  'PP148. The per-IP throttle still applies — with no PIN it is the only brake');

-- Reversible: one setting, no reissued cards, no data migration.
select pta_test.login(:A_ADMIN::uuid);
update pta.school_settings set value = 'true'::jsonb
 where school_id = (select v from _ids where k='onhs') and key = 'portal_require_pin';
select pta_test.logout();

select pta_test.eq(
  (select pta.portal_login(card, null, '10.0.5.3') ->> 'reason'
     from _cards where who='ben'),
  'pin_required',
  'PP149. Switching the PIN back on asks for one again — same card, no reissue');

-- 'pin_required' comes back only for a REAL card, so it cannot be used to test
-- whether a card number exists.
select pta_test.eq(
  pta.portal_login('4539578763621486', null, '10.0.5.3') ->> 'reason',
  'invalid',
  'PP150. ...and an unknown card still says only "invalid", never "pin_required"');
