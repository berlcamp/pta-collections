-- demo_mvts_seed.sql — DEMO DATA for the school "MVTS".
--
-- Run this by hand in the Supabase SQL Editor, as a single statement.
-- Everything is one transaction: if any step fails, nothing is left behind.
--
-- WHAT IT TOUCHES
--   Only the `pta` schema, and within it only rows belonging to the MVTS
--   school plus four demo staff profiles at @mvts.demo. Nothing in `public`,
--   nothing in `auth.users`, nothing belonging to construction-saas or
--   sms-demo. Undo it with demo_mvts_teardown.sql.
--
-- HOW IT WRITES
--   Money and charges go through the SECURITY DEFINER RPCs (assess_annual_fees,
--   create_penalty, waive_charge, create_payment, void_payment), exactly as the
--   app does — so receipt numbers, the overpayment guard and the audit trail are
--   all real. Only three things are patched afterwards with plain UPDATEs, because
--   create_payment deliberately does not let a caller choose them: payment_date
--   (so the charts have history), collected_by (so collections split across
--   cashiers) and acting_as_super_admin.
--
--   The RPCs are called with request.jwt.claims set to the super admin, which is
--   how the test fixtures impersonate users. No role switch is needed: auth.uid()
--   reads the GUC, not the SQL role.

do $$
declare
  -- ── identity ─────────────────────────────────────────────────────────────
  v_sa_email  constant text := 'berlcamp@gmail.com';
  v_uid       uuid;
  v_sa        uuid;

  -- ── scale ────────────────────────────────────────────────────────────────
  v_n         constant int := 120;   -- students

  -- ── ids ──────────────────────────────────────────────────────────────────
  v_school    uuid;
  v_year      uuid;
  v_admin     uuid;
  v_cash1     uuid;
  v_cash2     uuid;
  v_treas     uuid;
  v_cashiers  uuid[];
  v_sections  uuid[] := '{}';
  ft_pta      uuid;
  ft_scout    uuid;
  ft_id       uuid;
  ft_med      uuid;
  ft_grad     uuid;
  ft_pen      uuid;
  v_g10       uuid[];

  -- ── name pools ───────────────────────────────────────────────────────────
  v_male   constant text[] := array['Juan','Jose','Mark','Angelo','Carlo','Nino','Paolo','Rafael',
                                    'Miguel','Emilio','Andres','Diego','Gabriel','Ramon','Vicente'];
  v_female constant text[] := array['Maria','Ana','Jasmine','Kristine','Angelica','Rowena','Liezel',
                                    'Sharon','Grace','Divine','Charmaine','Rochelle','Precious',
                                    'Bernadette','Katrina'];
  v_last   constant text[] := array['Dela Cruz','Santos','Reyes','Bautista','Ocampo','Garcia','Mendoza',
                                    'Torres','Villanueva','Ramos','Aquino','Castillo','Flores','Rivera',
                                    'Gonzales','Lim','Tan','Uy','Alcantara','Panganiban'];
  v_mid    constant text[] := array['Abad','Bacani','Cruz','Domingo','Espino','Fajardo','Guzman',
                                    'Hidalgo','Ibanez','Jimenez'];
  v_occ    constant text[] := array['Farmer','Public School Teacher','Tricycle Driver','Market Vendor',
                                    'Nurse','Carpenter','OFW','Sari-sari Store Owner'];
  v_grades constant text[] := array['Grade 7','Grade 7','Grade 8','Grade 8',
                                    'Grade 9','Grade 9','Grade 10','Grade 10'];
  v_secnm  constant text[] := array['Sampaguita','Ilang-Ilang','Narra','Molave',
                                    'Rizal','Bonifacio','Mabini','Luna'];

  -- ── loop state ───────────────────────────────────────────────────────────
  i           int;
  v_sid       uuid;
  v_rec       record;
  v_bucket    int;
  v_method    text;
  v_ref       text;
  v_batches   jsonb[];
  v_items     jsonb;
  v_sum       numeric(12,2);
  v_pid       uuid;
  v_charges   int;
  v_payments  int := 0;
begin
  -- ═══════════════════════════════════════════════════════════════════════════
  -- 0. Preconditions
  -- ═══════════════════════════════════════════════════════════════════════════
  select p.id, p.auth_user_id into v_sa, v_uid
  from pta.profiles p
  where p.email = v_sa_email and p.global_role = 'super_admin';

  if v_sa is null then
    raise exception 'No super_admin profile for %. Run migration 0011 first.', v_sa_email;
  end if;
  if v_uid is null then
    raise exception 'Profile % has no auth_user_id yet. Sign in through Google once, then re-run.', v_sa_email;
  end if;
  if exists (select 1 from pta.schools where school_code = 'MVTS') then
    raise exception 'School MVTS already exists. Run demo_mvts_teardown.sql first.';
  end if;
  -- The name bijection below maps 60 students per sex onto a 15 x 20 grid of
  -- first/last names. Above 600 students it would start repeating pairs.
  if v_n > 600 then
    raise exception 'v_n = % exceeds 600, the point at which student names stop being unique.', v_n;
  end if;

  -- Impersonate the super admin for every RPC below.
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_uid, 'role', 'authenticated')::text,
                     true);

  -- Forces the session temp schema to exist so `pg_temp._lines` below resolves.
  create temp table if not exists _pta_seed_touch (i int) on commit drop;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 1. School and school year
  -- ═══════════════════════════════════════════════════════════════════════════
  v_school := pta.create_school(
    'MVTS', 'Misamis Valley Technical School', 'MVTS',
    'MVTS', 'Poblacion, Aguada Road', 'Ozamiz City',
    'Misamis Occidental', 'Region X', '088-521-0134', 'office@mvts.demo');

  update pta.schools
     set receipt_footer_text = 'This receipt is valid only with the school dry seal. '
                               || 'Keep it for your records.'
   where id = v_school;

  insert into pta.school_years (school_id, name, start_date, end_date, is_active, created_by)
  values (v_school, '2026-2027', date '2026-06-01', date '2027-03-31', true, v_sa)
  returning id into v_year;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 2. Demo staff
  --
  -- auth_user_id stays NULL — legal by D6, and it means this script never
  -- writes to the shared auth.users. These profiles cannot sign in; they exist
  -- so collections split across named cashiers in the reports.
  -- ═══════════════════════════════════════════════════════════════════════════
  insert into pta.profiles (email, full_name, global_role) values
    ('principal@mvts.demo',  'Elena Bacaltos-Ruiz', 'user'),
    ('cashier1@mvts.demo',   'Rosalie Amper',       'user'),
    ('cashier2@mvts.demo',   'Nilo Bagacay',        'user'),
    ('treasurer@mvts.demo',  'Fe Lagumbay',         'user');

  select id into v_admin from pta.profiles where email = 'principal@mvts.demo';
  select id into v_cash1 from pta.profiles where email = 'cashier1@mvts.demo';
  select id into v_cash2 from pta.profiles where email = 'cashier2@mvts.demo';
  select id into v_treas from pta.profiles where email = 'treasurer@mvts.demo';
  v_cashiers := array[v_cash1, v_cash2, v_cash1, v_treas];

  insert into pta.school_users (school_id, profile_id, role, status, created_by) values
    (v_school, v_admin, 'admin',     'active', v_sa),
    (v_school, v_cash1, 'cashier',   'active', v_sa),
    (v_school, v_cash2, 'cashier',   'active', v_sa),
    (v_school, v_treas, 'treasurer', 'active', v_sa);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 3. Sections
  -- ═══════════════════════════════════════════════════════════════════════════
  for i in 1 .. array_length(v_secnm, 1) loop
    insert into pta.sections (school_id, school_year_id, grade_level, name, created_by)
    values (v_school, v_year, v_grades[i], v_secnm[i], v_sa)
    returning id into v_sid;
    v_sections := v_sections || v_sid;
  end loop;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 4. Fee types
  -- ═══════════════════════════════════════════════════════════════════════════
  insert into pta.fee_types (school_id, name, description, category, default_amount, is_recurring, created_by)
  values (v_school, 'PTA Membership Fee', 'Annual PTA membership contribution, one per family.',
          'annual', 250.00, true, v_sa) returning id into ft_pta;

  insert into pta.fee_types (school_id, name, description, category, default_amount, is_recurring, created_by)
  values (v_school, 'Boy/Girl Scout Fee', 'Annual national scouting membership.',
          'annual', 150.00, true, v_sa) returning id into ft_scout;

  insert into pta.fee_types (school_id, name, description, category, default_amount, is_recurring, created_by)
  values (v_school, 'School ID and Lanyard', 'Issued once per school year.',
          'special', 120.00, false, v_sa) returning id into ft_id;

  insert into pta.fee_types (school_id, name, description, category, default_amount, is_recurring, created_by)
  values (v_school, 'Medical and Dental Fund', 'Clinic supplies and annual check-up.',
          'annual', 100.00, true, v_sa) returning id into ft_med;

  insert into pta.fee_types (school_id, name, description, category, default_amount, is_recurring, created_by)
  values (v_school, 'Graduation Fee', 'Grade 10 completers only.',
          'special', 500.00, false, v_sa) returning id into ft_grad;

  insert into pta.fee_types (school_id, name, description, category, default_amount, is_recurring, created_by)
  values (v_school, 'Late Payment Penalty', 'Assessed per pta.create_penalty.',
          'penalty', null, false, v_sa) returning id into ft_pen;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 5. Students, enrollments, guardians
  -- ═══════════════════════════════════════════════════════════════════════════
  -- Names come from a mixed-radix bijection, not from `i % array_length`.
  -- A multiplier that shares a factor with the pool size collapses the range:
  -- (i * 3) % 15 reaches only 5 of 15 names, which is how an earlier cut of this
  -- script produced 120 students with 40 distinct names between them.
  --
  -- k numbers the students within one sex (0..59). u = 91k mod 300 is a
  -- bijection onto 0..299 because 91 is coprime with 300, and splitting u into
  -- (u mod 15, u div 15) is a bijection onto the 15 x 20 first/last grid. So
  -- every (first_name, last_name) pair is distinct by construction, and the two
  -- sexes draw from disjoint first-name pools.
  insert into pta.students (school_id, lrn, first_name, middle_name, last_name,
                            birth_date, sex, status, created_by)
  select v_school,
         (136000000000 + g.i)::text,
         case when g.i % 2 = 0 then v_male  [1 + n.u % 15]
                                else v_female[1 + n.u % 15] end,
         v_mid [1 + n.k % 10],
         v_last[1 + (n.u / 15) % 20],
         date '2010-01-01' + ((g.i * 13) % 1400),
         case when g.i % 2 = 0 then 'M' else 'F' end,
         'active',
         v_sa
  from generate_series(1, v_n) as g(i)
  cross join lateral (
    select ((g.i - 1) / 2)              as k,
           (((g.i - 1) / 2) * 91) % 300 as u
  ) n;

  insert into pta.student_enrollments (school_id, student_id, school_year_id, section_id,
                                       grade_level, student_number, status, created_by)
  select v_school, s.id, v_year,
         v_sections[1 + (s.rn - 1) % 8],
         v_grades  [1 + (s.rn - 1) % 8],
         'MVTS-2026-' || lpad(s.rn::text, 4, '0'),
         'enrolled', v_sa
  from (select id, row_number() over (order by lrn) as rn
        from pta.students where school_id = v_school) s;

  -- One guardian per student. The guardian's uuid is derived from the student's
  -- with md5 rather than gen_random_uuid(), so the parent row and the link row
  -- can be written as two ordinary statements in the right order — no reliance
  -- on CTE evaluation order to satisfy the foreign key.
  insert into pta.parents_guardians (id, school_id, first_name, last_name,
                                     contact_number, address, occupation, created_by)
  select md5(s.id::text || ':mvts-guardian')::uuid, v_school,
         -- 7 is coprime with 15, so all fifteen names get used. Guardians
         -- share the student's surname, so repeats here read as families.
         case when s.rn % 2 = 0 then v_male  [1 + (s.rn * 7) % 15]
                                else v_female[1 + (s.rn * 7) % 15] end,
         s.last_name,
         '09' || lpad(((s.rn * 76543) % 1000000000)::text, 9, '0'),
         'Purok ' || (1 + s.rn % 7) || ', Barangay Aguada, Ozamiz City',
         v_occ[1 + s.rn % 8],
         v_sa
  from (select id, last_name, row_number() over (order by lrn) as rn
        from pta.students where school_id = v_school) s;

  insert into pta.student_guardians (school_id, student_id, guardian_id, relationship, is_primary)
  select v_school, s.id, md5(s.id::text || ':mvts-guardian')::uuid,
         case when s.rn % 2 = 0 then 'Father' else 'Mother' end,
         true
  from (select id, row_number() over (order by lrn) as rn
        from pta.students where school_id = v_school) s;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 6. Charges — through the real assessment RPC
  -- ═══════════════════════════════════════════════════════════════════════════
  perform * from pta.assess_annual_fees(
    v_school, v_year, array[ft_pta, ft_scout, ft_id, ft_med], null, date '2026-09-30');

  select array_agg(e.student_id) into v_g10
  from pta.student_enrollments e
  where e.school_id = v_school and e.school_year_id = v_year and e.grade_level = 'Grade 10';

  perform * from pta.assess_annual_fees(
    v_school, v_year, array[ft_grad], v_g10, date '2026-12-15');

  -- A handful of late-payment penalties.
  for v_rec in
    select e.student_id, row_number() over (order by e.student_number) as rn
    from pta.student_enrollments e
    where e.school_id = v_school and e.school_year_id = v_year
  loop
    if v_rec.rn % 17 = 3 then
      perform pta.create_penalty(
        v_school, v_rec.student_id, v_year, ft_pen, 50.00,
        'Late payment of PTA membership fee beyond the 30 September deadline.',
        date '2026-11-30');
    end if;
  end loop;

  -- Scholarship waivers: four full, four half.
  for v_rec in
    -- Ordered by student number, not by charge id: charge ids are random uuids,
    -- so ordering by them would move the waivers to different students on every
    -- run and change the payment counts with them.
    select b.id, row_number() over (order by e.student_number) as rn
    from pta.v_student_charge_balances b
    join pta.student_enrollments e
      on e.student_id = b.student_id and e.school_year_id = b.school_year_id
    where b.school_id = v_school and b.fee_type_id = ft_pta and b.status = 'active'
    order by e.student_number
    limit 8
  loop
    if v_rec.rn <= 4 then
      perform pta.waive_charge(v_rec.id, 250.00,
        'Full waiver — DepEd 4Ps beneficiary, approved by the PTA board.');
    else
      perform pta.waive_charge(v_rec.id, 125.00,
        'Half waiver — second sibling enrolled in the same school year.');
    end if;
  end loop;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 7. Payments — through pta.create_payment
  --
  -- Buckets by enrollment number, so the mix is reproducible rather than random:
  --   rn % 20 in  0..3  → two receipts (PTA fee first, then the balance)
  --   rn % 20 in  4..8  → one receipt clearing everything
  --   rn % 20 in  9..14 → partial: 40% of the largest open charge
  --   rn % 20 in 15..19 → nothing paid yet
  -- ═══════════════════════════════════════════════════════════════════════════
  for v_rec in
    select e.student_id, row_number() over (order by e.student_number) as rn
    from pta.student_enrollments e
    where e.school_id = v_school and e.school_year_id = v_year
  loop
    v_bucket := v_rec.rn % 20;
    continue when v_bucket >= 15;

    if v_rec.rn % 10 < 6 then
      v_method := 'cash';  v_ref := null;
    elsif v_rec.rn % 10 < 9 then
      v_method := 'gcash'; v_ref := 'GC' || lpad(((v_rec.rn * 9176) % 10000000)::text, 7, '0');
    else
      v_method := 'bank_transfer'; v_ref := 'LBP' || lpad(((v_rec.rn * 3391) % 1000000)::text, 6, '0');
    end if;

    if v_bucket < 4 then
      -- Two disjoint batches: the PTA fee, then everything else.
      v_batches := array(
        select jsonb_agg(jsonb_build_object('charge_id', b.id, 'amount', b.balance))
        from pta.v_student_charge_balances b
        where b.student_id = v_rec.student_id and b.school_year_id = v_year
          and b.status = 'active' and b.balance > 0
        group by (b.fee_type_id = ft_pta)
        order by (b.fee_type_id = ft_pta) desc
      );
    elsif v_bucket < 9 then
      v_batches := array(
        select jsonb_agg(jsonb_build_object('charge_id', b.id, 'amount', b.balance))
        from pta.v_student_charge_balances b
        where b.student_id = v_rec.student_id and b.school_year_id = v_year
          and b.status = 'active' and b.balance > 0
      );
    else
      v_batches := array(
        select jsonb_build_array(
                 jsonb_build_object('charge_id', b.id,
                                    'amount', greatest(round(b.balance * 0.4, 2), 1.00)))
        from pta.v_student_charge_balances b
        where b.student_id = v_rec.student_id and b.school_year_id = v_year
          and b.status = 'active' and b.balance > 0
        order by b.balance desc, b.id
        limit 1
      );
    end if;

    foreach v_items in array coalesce(v_batches, '{}'::jsonb[]) loop
      continue when v_items is null;
      continue when jsonb_array_length(v_items) = 0;

      select coalesce(sum((e ->> 'amount')::numeric), 0)
        into v_sum
      from jsonb_array_elements(v_items) e;
      continue when v_sum <= 0;

      -- create_payment builds a temp table named _lines with ON COMMIT DROP.
      -- Every call here is inside one transaction, so it must be cleared first
      -- or the second call fails with "relation _lines already exists".
      drop table if exists pg_temp._lines;

      perform * from pta.create_payment(
        v_school, v_rec.student_id, v_year, v_method, v_items,
        v_ref, null,
        case when v_method = 'cash' then ceil(v_sum / 50.0) * 50 else null end,
        null);

      v_payments := v_payments + 1;
    end loop;
  end loop;

  drop table if exists pg_temp._lines;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 8. Spread the payments over time and across cashiers
  --
  -- create_payment stamps payment_date = now() and collected_by = the caller,
  -- by design. For a demo the charts need history and the cashier report needs
  -- more than one name, so both are patched here. Manila local time is built
  -- first and then converted, so the day boundaries in v_payments_local land
  -- where a Philippine user expects.
  -- ═══════════════════════════════════════════════════════════════════════════
  with numbered as (
    select id, row_number() over (order by receipt_number) as rn
    from pta.payments
    where school_id = v_school
  )
  update pta.payments p
     set payment_date = ((current_date - ((n.rn * 29) % 74)::int)
                          + time '08:00'
                          + make_interval(mins => ((n.rn * 137) % 480)::int))
                        at time zone 'Asia/Manila',
         collected_by = v_cashiers[1 + ((n.rn - 1) % array_length(v_cashiers, 1))::int],
         acting_as_super_admin = false
  from numbered n
  where p.id = n.id;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 9. Three voids, so the void path and the "voided receipts are excluded
  --    from balances" rule are both visible in the demo.
  -- ═══════════════════════════════════════════════════════════════════════════
  for v_pid in
    select id from pta.payments
    where school_id = v_school and status = 'posted'
    order by receipt_number offset 6 limit 3
  loop
    perform pta.void_payment(v_pid, 'Duplicate entry — a replacement receipt was issued.');
  end loop;

  update pta.payments set voided_by = v_treas
   where school_id = v_school and status = 'voided';

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 10. Summary
  -- ═══════════════════════════════════════════════════════════════════════════
  select count(*) into v_charges from pta.student_charges where school_id = v_school;

  raise notice '─────────────────────────────────────────────';
  raise notice 'MVTS demo data created.';
  raise notice '  school_id      %', v_school;
  raise notice '  school_year    2026-2027 (active)';
  raise notice '  students       %', v_n;
  raise notice '  sections       %', array_length(v_sections, 1);
  raise notice '  charges        %', v_charges;
  raise notice '  payments       % (3 voided)', v_payments;
  raise notice '─────────────────────────────────────────────';
end $$;
