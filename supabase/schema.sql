-- ============================================================
-- ReliefDesk schema (v1 pilot, multi-tenant ready)
-- Run this in Supabase: SQL Editor -> New query -> paste -> Run
-- ============================================================

-- One row per school. Pilot uses a single row, but every table
-- references school_id so going multi-tenant later is a policy
-- change, not a schema rewrite.
create table schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  periods_per_day int not null default 8,
  daily_cover_cap int not null default 2,
  -- 'week' = Mon-Fri timetable; 'cycle' = Day 1..cycle_days rotation
  timetable_mode text not null default 'week' check (timetable_mode in ('week','cycle')),
  cycle_days int not null default 10 check (cycle_days between 2 and 14),
  current_cycle_day int not null default 1,
  created_at timestamptz default now()
);

create table teachers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null,
  subject text not null default '',
  active boolean not null default true,
  created_at timestamptz default now()
);

-- Timetable. Week mode: day_of_week 1=Mon ... 5=Fri.
-- Cycle mode: day_of_week = Day 1 ... Day N (N set per school).
-- A missing row for (teacher, day, period) means FREE.
create table timetable_slots (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  teacher_id uuid not null references teachers(id) on delete cascade,
  -- week mode: 1=Mon..5=Fri; cycle mode: 1..cycle_length
  day_of_week int not null check (day_of_week between 1 and 31),
  period int not null check (period >= 1),
  class_name text not null,
  room text not null default '',
  unique (teacher_id, day_of_week, period)
);

-- One absence row per teacher per date. periods = which lessons
-- they're out for (supports partial absence).
create table absences (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  teacher_id uuid not null references teachers(id) on delete cascade,
  date date not null,
  periods int[] not null,
  created_at timestamptz default now(),
  unique (teacher_id, date)
);

-- The generated covers. Also the fairness history:
-- the engine counts rows here from the last 14 days.
create table cover_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  date date not null,
  period int not null,
  absent_teacher_id uuid not null references teachers(id) on delete cascade,
  cover_teacher_id uuid references teachers(id) on delete set null, -- null = NO COVER FOUND
  class_name text not null default '',
  room text not null default '',
  overridden boolean not null default false,
  created_at timestamptz default now()
);

create index idx_slots_teacher on timetable_slots(teacher_id, day_of_week);
create index idx_absences_date on absences(school_id, date);
create index idx_covers_date on cover_assignments(school_id, date);
create index idx_covers_fairness on cover_assignments(cover_teacher_id, date);

-- ============================================================
-- Row Level Security: pilot = any signed-in user can access.
-- (One school, one admin login created in Supabase Auth.)
-- For multi-tenant later: add school_id to user metadata and
-- replace these policies with school_id = auth.jwt()->... checks.
-- ============================================================
alter table schools enable row level security;
alter table teachers enable row level security;
alter table timetable_slots enable row level security;
alter table absences enable row level security;
alter table cover_assignments enable row level security;

create policy "auth all schools" on schools for all to authenticated using (true) with check (true);
create policy "auth all teachers" on teachers for all to authenticated using (true) with check (true);
create policy "auth all slots" on timetable_slots for all to authenticated using (true) with check (true);
create policy "auth all absences" on absences for all to authenticated using (true) with check (true);
create policy "auth all covers" on cover_assignments for all to authenticated using (true) with check (true);

-- Seed the pilot school (rename in the app Settings later)
insert into schools (name) values ('My School');
