-- 0002_academic_and_people.sql
-- School years, sections, students, enrollments, guardians.
--
-- D8: students and guardians are school-scoped and duplicated across schools.
--     A national LRN under a GLOBAL unique constraint would reject a legitimate
--     transfer between two schools in this system. All uniqueness is per-school.
-- D9: `students` is permanent identity ONLY. All school-year data lives on
--     `student_enrollments`. v1 defined both and duplicated four columns.

-- ---------------------------------------------------------------------------
-- school_years
-- ---------------------------------------------------------------------------

create table pta.school_years (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references pta.schools(id) on delete cascade,
  name       text not null,                       -- '2026-2027'
  start_date date not null,
  end_date   date not null,
  is_active  boolean not null default false,
  created_by uuid references pta.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name),
  constraint school_years_date_order check (end_date > start_date),
  constraint school_years_name_format check (name ~ '^\d{4}-\d{4}$')
);

-- At most one active school year per school.
create unique index school_years_one_active_idx
  on pta.school_years (school_id)
  where is_active;

create trigger school_years_set_updated_at
  before update on pta.school_years
  for each row execute function pta.set_updated_at();

-- School years are NEVER deleted: financial history depends on them.
create or replace function pta.prevent_school_year_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'School years cannot be deleted; financial records depend on them.';
end;
$$;

create trigger school_years_no_delete
  before delete on pta.school_years
  for each row execute function pta.prevent_school_year_delete();

-- ---------------------------------------------------------------------------
-- Grade levels (fixed DepEd lookup) and sections
--
-- D21: v1 asked for a "manage classes/sections" screen with no table behind it.
-- Free-text sections produce 'Grade 7', 'GRADE 7', 'G7' and '7' as four distinct
-- sections and every by-section report is then wrong.
-- ---------------------------------------------------------------------------

create table pta.grade_levels (
  code       text primary key,
  label      text not null,
  sort_order int  not null
);

insert into pta.grade_levels (code, label, sort_order) values
  ('Kinder',   'Kinder',   0),
  ('Grade 1',  'Grade 1',  1),
  ('Grade 2',  'Grade 2',  2),
  ('Grade 3',  'Grade 3',  3),
  ('Grade 4',  'Grade 4',  4),
  ('Grade 5',  'Grade 5',  5),
  ('Grade 6',  'Grade 6',  6),
  ('Grade 7',  'Grade 7',  7),
  ('Grade 8',  'Grade 8',  8),
  ('Grade 9',  'Grade 9',  9),
  ('Grade 10', 'Grade 10', 10),
  ('Grade 11', 'Grade 11', 11),
  ('Grade 12', 'Grade 12', 12);

create table pta.sections (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references pta.schools(id) on delete cascade,
  school_year_id uuid not null references pta.school_years(id),
  grade_level    text not null references pta.grade_levels(code),
  name           text not null,
  created_by     uuid references pta.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (school_id, school_year_id, grade_level, name)
);

create index sections_school_year_idx on pta.sections (school_id, school_year_id);

create trigger sections_set_updated_at
  before update on pta.sections
  for each row execute function pta.set_updated_at();

-- ---------------------------------------------------------------------------
-- students — permanent identity only (D9)
-- ---------------------------------------------------------------------------

create table pta.students (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references pta.schools(id) on delete cascade,
  lrn          text,
  first_name   text not null,
  middle_name  text,
  last_name    text not null,
  suffix       text,
  birth_date   date,
  sex          text check (sex in ('M', 'F')),
  status       text not null default 'active'
                 check (status in ('active', 'inactive', 'graduated', 'transferred_out')),
  notes        text,
  created_by   uuid references pta.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint students_lrn_format check (lrn is null or lrn ~ '^\d{12}$')
);

-- D8: school-scoped, never global.
create unique index students_school_lrn_idx
  on pta.students (school_id, lrn)
  where lrn is not null;

create index students_school_idx on pta.students (school_id, status);
create index students_name_trgm_idx on pta.students
  using gin ((coalesce(first_name, '') || ' ' || coalesce(middle_name, '') || ' ' ||
              coalesce(last_name, '')) gin_trgm_ops);

create trigger students_set_updated_at
  before update on pta.students
  for each row execute function pta.set_updated_at();

-- ---------------------------------------------------------------------------
-- student_enrollments — all school-year data (D9)
-- ---------------------------------------------------------------------------

create table pta.student_enrollments (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references pta.schools(id) on delete cascade,
  student_id     uuid not null references pta.students(id) on delete cascade,
  school_year_id uuid not null references pta.school_years(id),
  section_id     uuid references pta.sections(id),
  grade_level    text not null references pta.grade_levels(code),
  student_number text,
  status         text not null default 'enrolled'
                   check (status in ('enrolled', 'transferred_out', 'dropped', 'graduated')),
  created_by     uuid references pta.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Required as the FK target for student_charges and payments (D10).
  unique (student_id, school_year_id)
);

create unique index student_enrollments_number_idx
  on pta.student_enrollments (school_id, school_year_id, student_number)
  where student_number is not null;

create index student_enrollments_year_idx
  on pta.student_enrollments (school_id, school_year_id, status);
create index student_enrollments_section_idx on pta.student_enrollments (section_id);

create trigger student_enrollments_set_updated_at
  before update on pta.student_enrollments
  for each row execute function pta.set_updated_at();

-- ---------------------------------------------------------------------------
-- Guardians  (D8: school-scoped, duplicated across schools by design)
-- ---------------------------------------------------------------------------

create table pta.parents_guardians (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references pta.schools(id) on delete cascade,
  first_name     text not null,
  middle_name    text,
  last_name      text not null,
  suffix         text,
  contact_number text,
  email          text,
  address        text,
  occupation     text,
  notes          text,
  created_by     uuid references pta.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index guardians_school_idx on pta.parents_guardians (school_id);
create index guardians_name_trgm_idx on pta.parents_guardians
  using gin ((coalesce(first_name, '') || ' ' || coalesce(last_name, '')) gin_trgm_ops);

-- Match key used by the CSV importer to reuse an existing guardian.
create index guardians_match_idx on pta.parents_guardians
  (school_id, pta.normalize_name(first_name || ' ' || last_name),
   pta.normalize_contact(contact_number));

create trigger guardians_set_updated_at
  before update on pta.parents_guardians
  for each row execute function pta.set_updated_at();

create table pta.student_guardians (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references pta.schools(id) on delete cascade,
  student_id   uuid not null references pta.students(id) on delete cascade,
  guardian_id  uuid not null references pta.parents_guardians(id) on delete cascade,
  relationship text not null default 'Guardian'
                 check (relationship in ('Mother', 'Father', 'Grandparent',
                                         'Legal Guardian', 'Sibling', 'Guardian', 'Other')),
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (student_id, guardian_id)
);

-- At most one primary guardian per student.
create unique index student_guardians_one_primary_idx
  on pta.student_guardians (student_id)
  where is_primary;

create index student_guardians_guardian_idx on pta.student_guardians (guardian_id);
