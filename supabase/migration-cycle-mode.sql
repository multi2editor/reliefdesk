-- ============================================================
-- Migration: cycle-mode timetables (run once in Supabase SQL Editor)
-- Safe to run on your existing pilot database — no data is lost.
-- ============================================================

-- 1. Allow day numbers beyond Mon–Fri (up to a 14-day cycle)
alter table timetable_slots drop constraint if exists timetable_slots_day_of_week_check;
alter table timetable_slots add constraint timetable_slots_day_of_week_check
  check (day_of_week between 1 and 14);

-- 2. School-level timetable mode settings
alter table schools add column if not exists timetable_mode text not null default 'week'
  check (timetable_mode in ('week','cycle'));
alter table schools add column if not exists cycle_days int not null default 10
  check (cycle_days between 2 and 14);
alter table schools add column if not exists current_cycle_day int not null default 1;
