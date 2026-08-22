-- seed.sql — LOCAL DEVELOPMENT ONLY.  (D24)
--
-- ******************************************************************
-- *  NEVER RUN THIS AGAINST THE SHARED SUPABASE PROJECT.           *
-- *  It is demo data. Production gets migration 0011's single      *
-- *  super-admin row and nothing else.                             *
-- ******************************************************************
--
-- Profiles here have auth_user_id = NULL, which is legal because profiles are
-- decoupled from auth.users (D6). That is what lets us seed a realistic
-- dashboard without fabricating Google identities.

do $$
declare
  v_school   uuid;
  v_year     uuid;
  v_admin    uuid;
  v_cashier  uuid;
  v_treas    uuid;
  v_sec_a    uuid;
  v_sec_b    uuid;
  v_fee_pta  uuid;
  v_fee_mort uuid;
  v_fee_lost uuid;
  v_student  uuid;
  v_guardian uuid;
  v_charge   uuid;
  v_payment  uuid;
  v_receipt  text;
  v_names    text[][] := array[
    array['Juan',   'Dela',    'Cruz',      'M'],
    array['Maria',  'Luz',     'Bautista',  'F'],
    array['Pedro',  'Santos',  'Reyes',     'M'],
    array['Ana',    'Marie',   'Villanueva','F'],
    array['Jose',   'Rizal',   'Mercado',   'M'],
    array['Sofia',  'Isabel',  'Ramos',     'F'],
    array['Miguel', 'Angelo',  'Torres',    'M'],
    array['Liza',   'Grace',   'Domingo',   'F'],
    array['Carlo',  'Antonio', 'Aquino',    'M'],
    array['Bea',    'Nicole',  'Fernandez', 'F']
  ];
  i integer;
begin
  if exists (select 1 from pta.schools where school_code = 'DEMO') then
    raise notice 'Seed data already present; skipping.';
    return;
  end if;

  -- Staff. No auth users needed.
  insert into pta.profiles (email, full_name, global_role)
  values ('demo.admin@example.com', 'Demo Administrator', 'user')
  returning id into v_admin;

  insert into pta.profiles (email, full_name, global_role)
  values ('demo.cashier@example.com', 'Rosa Cashier', 'user')
  returning id into v_cashier;

  insert into pta.profiles (email, full_name, global_role)
  values ('demo.treasurer@example.com', 'Ben Treasurer', 'user')
  returning id into v_treas;

  insert into pta.schools (
    school_code, name, short_name, address, city, province, region,
    contact_number, receipt_prefix, receipt_footer_text, created_by
  ) values (
    'DEMO', 'Ozamiz National High School (Demo)', 'ONHS-Demo',
    'Rizal Avenue', 'Ozamiz City', 'Misamis Occidental', 'Region X',
    '(088) 521-0000', 'DEMO', 'Thank you for supporting our PTA.', v_admin
  )
  returning id into v_school;

  insert into pta.school_users (school_id, profile_id, role, created_by) values
    (v_school, v_admin,   'admin',     v_admin),
    (v_school, v_cashier, 'cashier',   v_admin),
    (v_school, v_treas,   'treasurer', v_admin);

  insert into pta.school_years (school_id, name, start_date, end_date, is_active, created_by)
  values (v_school, '2026-2027', '2026-06-01', '2027-03-31', true, v_admin)
  returning id into v_year;

  insert into pta.sections (school_id, school_year_id, grade_level, name, created_by)
  values (v_school, v_year, 'Grade 7', 'Sampaguita', v_admin)
  returning id into v_sec_a;

  insert into pta.sections (school_id, school_year_id, grade_level, name, created_by)
  values (v_school, v_year, 'Grade 8', 'Rizal', v_admin)
  returning id into v_sec_b;

  insert into pta.fee_types (school_id, name, category, default_amount, is_recurring, created_by)
  values (v_school, 'PTA Annual Membership', 'annual', 100.00, true, v_admin)
  returning id into v_fee_pta;

  insert into pta.fee_types (school_id, name, category, default_amount, is_recurring, created_by)
  values (v_school, 'Mortuary Assistance', 'annual', 50.00, true, v_admin)
  returning id into v_fee_mort;

  insert into pta.fee_types (school_id, name, category, default_amount, created_by)
  values (v_school, 'Lost ID', 'penalty', 100.00, v_admin)
  returning id into v_fee_lost;

  insert into pta.fee_types (school_id, name, category, default_amount, created_by)
  values (v_school, 'School Assistance Fund', 'special', 75.00, v_admin);

  -- Ten students, each with a guardian.
  for i in 1..array_length(v_names, 1) loop
    insert into pta.students (
      school_id, lrn, first_name, middle_name, last_name, sex, created_by
    ) values (
      v_school,
      '1000000000' || lpad(i::text, 2, '0'),
      v_names[i][1], v_names[i][2], v_names[i][3], v_names[i][4], v_admin
    )
    returning id into v_student;

    insert into pta.student_enrollments (
      school_id, student_id, school_year_id, section_id,
      grade_level, student_number, created_by
    ) values (
      v_school, v_student, v_year,
      case when i <= 6 then v_sec_a else v_sec_b end,
      case when i <= 6 then 'Grade 7' else 'Grade 8' end,
      '2026-' || lpad(i::text, 3, '0'),
      v_admin
    );

    insert into pta.parents_guardians (
      school_id, first_name, last_name, contact_number, created_by
    ) values (
      v_school,
      case when i % 2 = 0 then 'Elena' else 'Ramon' end,
      v_names[i][3],
      '0917' || lpad((1000000 + i * 37)::text, 7, '0'),
      v_admin
    )
    returning id into v_guardian;

    insert into pta.student_guardians (
      school_id, student_id, guardian_id, relationship, is_primary
    ) values (
      v_school, v_student, v_guardian,
      case when i % 2 = 0 then 'Mother' else 'Father' end,
      true
    );
  end loop;

  -- Annual assessment for everyone: 10 students x 2 fees = 20 charges.
  insert into pta.student_charges (
    school_id, student_id, school_year_id, fee_type_id,
    description, amount, due_date, created_by
  )
  select v_school, e.student_id, v_year, ft.id, ft.name, ft.default_amount,
         date '2026-08-31', v_admin
  from pta.student_enrollments e
  cross join pta.fee_types ft
  where e.school_id = v_school
    and e.school_year_id = v_year
    and ft.id in (v_fee_pta, v_fee_mort)
  on conflict do nothing;

  -- Two penalties.
  insert into pta.student_charges (
    school_id, student_id, school_year_id, fee_type_id,
    description, amount, due_date, created_by
  )
  select v_school, e.student_id, v_year, v_fee_lost,
         'Lost school identification card', 100.00, date '2026-09-30', v_admin
  from pta.student_enrollments e
  where e.school_id = v_school and e.school_year_id = v_year
  order by e.student_number
  limit 2;

  -- Payments: a mix of full, partial, every method, and one voided.
  -- Written directly rather than through create_payment because the RPC needs
  -- an authenticated auth.uid(), which seed data has no way to provide.
  for i in 1..7 loop
    select c.student_id into v_student
    from pta.student_charges c
    join pta.student_enrollments e
      on e.student_id = c.student_id and e.school_year_id = c.school_year_id
    where c.school_id = v_school and c.school_year_id = v_year
    group by c.student_id, e.student_number
    order by e.student_number
    offset i - 1 limit 1;

    continue when v_student is null;

    insert into pta.receipt_counters (school_id, school_year_id, next_seq)
    values (v_school, v_year, 1)
    on conflict (school_id, school_year_id) do nothing;

    select 'DEMO-2026-' || lpad(rc.next_seq::text, 6, '0') into v_receipt
    from pta.receipt_counters rc
    where rc.school_id = v_school and rc.school_year_id = v_year;

    update pta.receipt_counters set next_seq = next_seq + 1
    where school_id = v_school and school_year_id = v_year;

    select c.id into v_charge
    from pta.student_charges c
    where c.student_id = v_student and c.school_year_id = v_year
      and c.fee_type_id = v_fee_pta
    limit 1;

    continue when v_charge is null;

    insert into pta.payments (
      school_id, receipt_number, student_id, school_year_id, payment_date,
      total_amount, payment_method, collected_by, status,
      voided_at, voided_by, void_reason
    ) values (
      v_school, v_receipt, v_student, v_year,
      now() - make_interval(days => (7 - i)),
      -- Payments 1-4 settle the fee; 5-7 are partial.
      case when i <= 4 then 100.00 else 40.00 end,
      (array['cash', 'cash', 'gcash', 'bank_transfer', 'cash', 'gcash', 'other'])[i],
      case when i % 2 = 0 then v_cashier else v_treas end,
      -- Payment 7 is voided, so reports can be checked for exclusion.
      case when i = 7 then 'voided' else 'posted' end,
      case when i = 7 then now() else null end,
      case when i = 7 then v_treas else null end,
      case when i = 7 then 'Duplicate entry — recorded twice at the window' else null end
    )
    returning id into v_payment;

    insert into pta.payment_items (school_id, payment_id, student_charge_id, amount)
    values (v_school, v_payment, v_charge,
            case when i <= 4 then 100.00 else 40.00 end);

    insert into pta.audit_logs (
      school_id, profile_id, action, entity_type, entity_id, new_values
    ) values (
      v_school, case when i % 2 = 0 then v_cashier else v_treas end,
      'PAYMENT_CREATED', 'payment', v_payment,
      jsonb_build_object('receipt_number', v_receipt, 'seeded', true)
    );
  end loop;

  -- One partial waiver, so the waived path has data too.
  update pta.student_charges
     set waived_amount = 50.00,
         status_reason = 'Second sibling discount'
   where id = (
     select c.id from pta.student_charges c
     where c.school_id = v_school and c.fee_type_id = v_fee_pta
       and not exists (select 1 from pta.payment_items pi where pi.student_charge_id = c.id)
     limit 1
   );

  raise notice 'Seeded demo school % with 10 students.', v_school;
end $$;
