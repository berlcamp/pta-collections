-- 10_gate_snapshot.sql — migration 0025: the gate reads its own roster.
--
-- Runs after 06_gate.sql and reuses its two readers, 'onhs-main-gate' and
-- 'tnhs-main-gate', and whatever cards 06 left bound. Every "must be denied"
-- case is here because the caller of gate_roster_snapshot() is anon, holding a
-- key that is public: the secret is the only thing standing between a
-- stranger and a school's names and card numbers.

\set A_ADMIN   '''22222222-2222-2222-2222-222222222222'''
\set A_CASHIER '''33333333-3333-3333-3333-333333333333'''
\set B_ADMIN   '''55555555-5555-5555-5555-555555555555'''

-- The assertions below run AS anon, the role the device actually calls with,
-- so anon needs to record results. Test schema only; pta is untouched.
grant insert on pta_test.results to anon;
grant usage on sequence pta_test.results_id_seq to anon;

-- ---------------------------------------------------------------------------
-- issue_gate_device_token — who may mint a secret
-- ---------------------------------------------------------------------------
select pta_test.login(:A_CASHIER::uuid);
select pta_test.throws($$ select pta.issue_gate_device_token('onhs-main-gate') $$,
  'GR1. A cashier cannot issue a gate device token');
select pta_test.logout();

select pta_test.login(:B_ADMIN::uuid);
select pta_test.throws($$ select pta.issue_gate_device_token('onhs-main-gate') $$,
  'GR2. Another school''s admin cannot issue a token for your reader');
select pta_test.logout();

select pta_test.login(:A_ADMIN::uuid);
select pta_test.throws($$ select pta.issue_gate_device_token('no-such-gate') $$,
  'GR3. Issuing for an unknown device fails loudly');

select pta.issue_gate_device_token('onhs-main-gate') as tok \gset

select pta_test.ok(:'tok' ~ '^gt_[0-9a-f]{64}$',
  'GR4. A token is gt_ plus 64 hex characters');

select pta_test.ok(
  not exists (select 1 from pta.gate_devices where token_hash = :'tok'),
  'GR6. The token itself is stored nowhere on the device row');

select pta_test.eq(
  (select (new_values->>'device_id') || '/' || (new_values->>'replaced')
     from pta.audit_logs
    where action = 'GATE_DEVICE_TOKEN_ISSUED'
    order by created_at desc limit 1),
  'onhs-main-gate/false',
  'GR7. Issuing is audited, naming the device');

select pta_test.ok(
  not exists (select 1 from pta.audit_logs
               where action = 'GATE_DEVICE_TOKEN_ISSUED'
                 and new_values::text like '%' || :'tok' || '%'),
  'GR8. The audit row never contains the token');
select pta_test.logout();

-- As the owner: gate_token_hash() is not granted to anyone, staff included.
select pta_test.eq(
  (select token_hash from pta.gate_devices where device_id = 'onhs-main-gate'),
  pta.gate_token_hash(:'tok'),
  'GR5. Only the token''s SHA-256 is stored');

-- ---------------------------------------------------------------------------
-- gate_roster_snapshot — what the device's anon key gets back
-- ---------------------------------------------------------------------------
set role anon;
select pta.gate_roster_snapshot('onhs-main-gate', :'tok') as snap \gset
reset role;

select pta_test.eq(
  (:'snap'::jsonb->>'school_id')::uuid,
  (select id from pta.schools where school_code = 'ONHS'),
  'GR9. The right token returns its own school''s snapshot');

select pta_test.eq(
  jsonb_array_length(:'snap'::jsonb->'students'),
  (select count(*)::int from pta.gate_roster r join pta.schools s on s.id = r.school_id
    where s.school_code = 'ONHS'),
  'GR10. Every student on the school''s active roster is in it');

select pta_test.ok(
  jsonb_array_length(:'snap'::jsonb->'students') > 0,
  'GR11. ...and the fixtures make that a non-empty roster');

select pta_test.ok(
  not exists (
    select 1 from jsonb_array_elements(:'snap'::jsonb->'students') st
      join pta.students s on s.id = (st->>'student_id')::uuid
      join pta.schools  k on k.id = s.school_id
     where k.school_code <> 'ONHS'),
  'GR12. No other school''s student leaks into the snapshot');

select pta_test.eq(
  (select array_agg(k order by k)
     from jsonb_object_keys(:'snap'::jsonb->'students'->0) k),
  array['full_name', 'grade_level', 'section_name', 'student_id', 'student_no'],
  'GR13. A student carries exactly what the screen shows — no guardians, no fees');

select pta_test.eq(
  jsonb_array_length(:'snap'::jsonb->'cards'),
  (select count(*)::int
     from pta.student_cards c
     join pta.gate_roster r on r.student_id = c.student_id
     join pta.schools s on s.id = c.school_id
    where s.school_code = 'ONHS' and c.revoked_at is null),
  'GR14. Cards are the active cards of students on the roster');

select pta_test.ok(
  jsonb_array_length(:'snap'::jsonb->'cards') > 0,
  'GR15. ...and 06 left at least one such card bound');

select pta_test.ok(
  not exists (
    select 1 from jsonb_array_elements(:'snap'::jsonb->'cards') c
     where not exists (
       select 1 from jsonb_array_elements(:'snap'::jsonb->'students') st
        where st->>'student_id' = c->>'student_id')),
  'GR16. Every card points at a student in the same snapshot');

select pta_test.ok(
  not exists (
    select 1 from jsonb_array_elements(:'snap'::jsonb->'cards') c
      join pta.student_cards sc on sc.card_uid = c->>'card_uid'
                               and sc.student_id = (c->>'student_id')::uuid
     where sc.revoked_at is not null
       and not exists (select 1 from pta.student_cards a
                        where a.card_uid = sc.card_uid
                          and a.student_id = sc.student_id
                          and a.revoked_at is null)),
  'GR17. A revoked card is not in the snapshot');

-- ---------------------------------------------------------------------------
-- Every way to be refused, and all of them the same refusal
-- ---------------------------------------------------------------------------
set role anon;
select pta_test.throws(
  $$ select pta.gate_roster_snapshot('onhs-main-gate', 'gt_wrong') $$,
  'GR18. A wrong token is refused');
select pta_test.throws(
  $$ select pta.gate_roster_snapshot('onhs-main-gate', null) $$,
  'GR19. No token is refused');
select pta_test.throws(
  format($$ select pta.gate_roster_snapshot('tnhs-main-gate', %L) $$, :'tok'),
  'GR20. One device''s token does not open another device''s school');
select pta_test.throws(
  $$ select pta.gate_roster_snapshot('tnhs-main-gate', '') $$,
  'GR21. A device that was never issued a token cannot read at all');
select pta_test.throws(
  format($$ select pta.gate_roster_snapshot('no-such-gate', %L) $$, :'tok'),
  'GR22. An unknown device is refused');
reset role;

-- Unknown device, wrong token: callers must not be able to tell them apart,
-- or the error becomes a way to list which device names exist.
create or replace function pta_test.snapshot_error(p_device text, p_token text)
returns text language plpgsql as $$
begin
  perform pta.gate_roster_snapshot(p_device, p_token);
  return null;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;

select pta_test.eq(
  pta_test.snapshot_error('no-such-gate', 'x'),
  pta_test.snapshot_error('onhs-main-gate', 'x'),
  'GR23. An unknown device and a wrong token raise the identical error');

-- An inactive device is shut out even with its correct token.
update pta.gate_devices set active = false where device_id = 'onhs-main-gate';
set role anon;
select pta_test.throws(
  format($$ select pta.gate_roster_snapshot('onhs-main-gate', %L) $$, :'tok'),
  'GR24. A deactivated device cannot read, even with its token');
reset role;
update pta.gate_devices set active = true where device_id = 'onhs-main-gate';

-- Rotation: reissuing is how a stolen mini PC gets locked out.
select pta_test.login(:A_ADMIN::uuid);
select pta.issue_gate_device_token('onhs-main-gate') as tok2 \gset
select pta_test.logout();

set role anon;
select pta_test.throws(
  format($$ select pta.gate_roster_snapshot('onhs-main-gate', %L) $$, :'tok'),
  'GR25. Reissuing a token kills the old one');
select pta_test.ok(
  pta.gate_roster_snapshot('onhs-main-gate', :'tok2') is not null,
  'GR26. ...and the new one works');
reset role;

select pta_test.eq(
  (select new_values->>'replaced' from pta.audit_logs
    where action = 'GATE_DEVICE_TOKEN_ISSUED'
    order by created_at desc limit 1),
  'true',
  'GR27. The audit row records that a reissue replaced a live token');

-- ---------------------------------------------------------------------------
-- The outer door: anon gained exactly one more verb, and still no tables
-- ---------------------------------------------------------------------------
select pta_test.ok(
  has_function_privilege('anon', 'pta.gate_roster_snapshot(text, text)', 'execute'),
  'GR28. anon CAN call the snapshot — the device key''s second verb');
select pta_test.ok(
  not has_function_privilege('anon', 'pta.issue_gate_device_token(text)', 'execute'),
  'GR29. anon cannot mint tokens');
select pta_test.ok(
  not has_table_privilege('anon', 'pta.gate_devices', 'select'),
  'GR30. anon still cannot read gate_devices, token hashes included');
select pta_test.ok(
  not has_table_privilege('anon', 'pta.gate_roster', 'select'),
  'GR31. anon still cannot read the roster view directly');
