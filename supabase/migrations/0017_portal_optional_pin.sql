-- 0017_portal_optional_pin.sql
-- Make the parent-portal PIN optional, per school.
--
-- WHY THIS EXISTS
-- 0016 shipped card + PIN. This makes the PIN a per-school setting so a school
-- can run card-only sign-in, and turn the PIN back on later without another
-- migration and without reissuing a single card.
--
-- ---------------------------------------------------------------------------
-- WHAT CARD-ONLY ACTUALLY MEANS. Read this before switching it off.
-- ---------------------------------------------------------------------------
-- With no PIN the barcode is a single-factor BEARER credential:
--
--   * It is worn on a lanyard and is readable from a photograph across a room.
--   * It is scanned at the POS, so cashiers read card numbers all day as part
--     of their normal work (which is why reset_parent_pin() was staff-only).
--   * Whoever holds the number sees a child's gate arrivals and departures,
--     and can submit payment claims in that family's name.
--
-- What still protects it, and what does not:
--
--   * Enumeration is NOT the weak point. Card numbers are 15 CSPRNG digits plus
--     a Luhn check (0016), so guessing is ~10^15 and the IP throttle below caps
--     it long before that matters.
--   * portal_accounts.failed_attempts / locked_until stop meaning anything,
--     because there is no longer a secret to get wrong. The per-IP throttle in
--     portal_login() becomes the ONLY brake, so it is kept and still enforced.
--   * Revocation still works, and is now the primary control: a lost card is an
--     open door until somebody presses Revoke.
--
-- Nothing is deleted here. pin_hash, pin_salt, must_change_pin,
-- portal_change_pin() and reset_parent_pin() all stay, and issuance still mints
-- a PIN, so turning the setting back on is one checkbox rather than a data
-- migration.
--
-- Apply by hand in the SQL Editor, in order, like every other migration here.
-- Never `supabase db push`: the project is shared with construction-saas and
-- sms-demo.

-- ---------------------------------------------------------------------------
-- portal_pin_required(school_id)
--
-- school_settings key 'portal_require_pin', written by /admin/settings.
--
-- DEFAULT FALSE. That is a deliberate product decision, not a security opinion:
-- the setting is surfaced as a checkbox an administrator ticks, so card-only is
-- something a school is looking at on screen rather than something it inherits
-- silently. The paragraph above is what that checkbox is choosing between.
--
-- Accepts a bare JSON boolean or {"required": true}, matching how the other
-- portal settings are read -- school_settings gets hand-edited in the SQL
-- editor and guessing the wrapper shape should not silently disable a PIN.
-- ---------------------------------------------------------------------------

create or replace function pta.portal_pin_required(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pta, public
as $$
  select coalesce(
    (select coalesce((ss.value ->> 'required')::boolean, (ss.value #>> '{}')::boolean)
       from pta.school_settings ss
      where ss.school_id = p_school_id and ss.key = 'portal_require_pin'),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- v_portal_account gains pin_required.
--
-- The signed-in shell has to know: with the PIN off, must_change_pin must NOT
-- send a parent to /portal/set-pin, or they would be asked to replace a secret
-- their school does not use and could never have been told.
-- ---------------------------------------------------------------------------

-- Dropped, not replaced: `create or replace view` cannot insert a column in the
-- middle of the list, and pin_required belongs next to must_change_pin rather
-- than bolted on the end. Nothing depends on this view, and the grants are
-- re-issued at the foot of this file.
drop view if exists pta.v_portal_account;

create view pta.v_portal_account
with (security_invoker = off) as
select
  a.id,
  a.school_id,
  a.guardian_id,
  '••••••••••••' || right(a.card_number, 4) as card_masked,
  a.must_change_pin,
  pta.portal_pin_required(a.school_id) as pin_required,
  a.locale,
  a.locked_until,
  a.last_login_at,
  a.issued_at,
  s.name as school_name,
  (select coalesce(ss.value ->> 'number', ss.value #>> '{}')
     from pta.school_settings ss
    where ss.school_id = a.school_id and ss.key = 'gcash_number') as gcash_number,
  pta.display_name(g.last_name, g.first_name, g.middle_name, g.suffix) as guardian_name
from pta.portal_accounts a
join pta.schools s on s.id = a.school_id
join pta.parents_guardians g on g.id = a.guardian_id
where a.guardian_id = pta.current_guardian_id();

-- ---------------------------------------------------------------------------
-- portal_login — the PIN check becomes conditional.
--
-- The ORDER of the checks matters and is unchanged: throttle, then card shape,
-- then account, then (if required) lockout and PIN. A caller still cannot tell
-- an unknown card from a wrong PIN, and now also cannot tell a PIN-less school
-- from a PIN-ful one until they present a real card.
-- ---------------------------------------------------------------------------

create or replace function pta.portal_login(
  p_card_number text,
  p_pin         text default null,
  p_ip          text default 'unknown'
) returns jsonb
language plpgsql
security definer
set search_path = pta, public, pg_temp
as $$
declare
  acct         pta.portal_accounts%rowtype;
  v_card       text;
  v_ip_hits    int;
  v_school     record;
  v_pin_needed boolean;
begin
  v_card := regexp_replace(coalesce(p_card_number, ''), '[^0-9]', '', 'g');

  delete from pta.portal_login_attempts where attempted_at < now() - interval '1 day';

  -- With the PIN off this throttle is the ONLY brake on the sign-in endpoint,
  -- so it runs first and applies to every mode.
  select count(*) into v_ip_hits
    from pta.portal_login_attempts
   where ip = p_ip
     and not succeeded
     and attempted_at > now() - interval '15 minutes';

  if v_ip_hits >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'throttled');
  end if;

  if length(v_card) <> 16 or not pta.luhn_ok(v_card) then
    insert into pta.portal_login_attempts (ip, card_number) values (p_ip, v_card);
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select * into acct from pta.portal_accounts where card_number = v_card;

  if not found or acct.status <> 'active' then
    insert into pta.portal_login_attempts (ip, card_number) values (p_ip, v_card);
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  v_pin_needed := pta.portal_pin_required(acct.school_id);

  if v_pin_needed then
    if acct.locked_until is not null and acct.locked_until > now() then
      return jsonb_build_object('ok', false, 'reason', 'locked',
                                'locked_until', acct.locked_until);
    end if;

    -- The form sends the card alone first. Answering 'pin_required' is what
    -- lets ONE login screen serve both modes: it reveals the PIN field only
    -- for a school that uses one, and only once a real card has been given --
    -- so the answer leaks nothing about a card that does not exist.
    if p_pin is null or p_pin = '' then
      return jsonb_build_object('ok', false, 'reason', 'pin_required');
    end if;

    if pta.portal_hash_pin(p_pin, acct.pin_salt) <> acct.pin_hash then
      update pta.portal_accounts
         set failed_attempts = failed_attempts + 1,
             locked_until = case when failed_attempts + 1 >= 5
                                 then now() + interval '15 minutes' else locked_until end
       where id = acct.id
      returning * into acct;

      insert into pta.portal_login_attempts (ip, card_number) values (p_ip, v_card);

      if acct.locked_until is not null and acct.locked_until > now() then
        insert into pta.audit_logs (school_id, action, entity_type, entity_id, new_values)
        values (acct.school_id, 'PORTAL_LOCKED_OUT', 'portal_account', acct.id,
                jsonb_build_object('locked_until', acct.locked_until));
        return jsonb_build_object('ok', false, 'reason', 'locked',
                                  'locked_until', acct.locked_until);
      end if;

      return jsonb_build_object('ok', false, 'reason', 'invalid',
                                'attempts_left', greatest(5 - acct.failed_attempts, 0));
    end if;
  end if;

  update pta.portal_accounts
     set failed_attempts = 0, locked_until = null, last_login_at = now()
   where id = acct.id;

  insert into pta.portal_login_attempts (ip, card_number, succeeded)
  values (p_ip, v_card, true);

  select s.id, s.name, s.school_code into v_school
    from pta.schools s where s.id = acct.school_id;

  return jsonb_build_object(
    'ok',              true,
    'guardian_id',     acct.guardian_id,
    'account_id',      acct.id,
    'school_id',       acct.school_id,
    'school_name',     v_school.name,
    'locale',          acct.locale,
    'pin_required',    v_pin_needed,
    -- A school with no PIN must never send a parent to /portal/set-pin: they
    -- would be asked to replace a secret nobody ever gave them.
    'must_change_pin', v_pin_needed and acct.must_change_pin
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. The signature gained a default, so the old three-argument form is
-- gone and both must be re-granted.
-- ---------------------------------------------------------------------------

revoke all on function pta.portal_login(text, text, text)        from public;
revoke all on function pta.portal_pin_required(uuid)             from public;

grant execute on function pta.portal_login(text, text, text)     to anon, authenticated;
grant execute on function pta.portal_pin_required(uuid)          to authenticated;

grant select on pta.v_portal_account to authenticated;
revoke all  on pta.v_portal_account from anon;
