// ============================================================
// Day helpers — supports both timetable modes:
//   'week'  : days 1..5 = Mon..Fri
//   'cycle' : days 1..cycle_length = Day 1, Day 2, ...
// ============================================================

const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export function dayCount(school) {
  return school.timetable_mode === 'cycle' ? school.cycle_length : 5;
}

export function dayLabel(school, day) {
  return school.timetable_mode === 'cycle' ? `Day ${day}` : WEEK_LABELS[day - 1];
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Mon=1..Fri=5; weekends map to Monday so admin can prep ahead
function weekdayIndex(d = new Date()) {
  const n = d.getDay();
  return n >= 1 && n <= 5 ? n : 1;
}

// Count school days (Mon-Fri) strictly after `fromISO`, up to and
// including today. Used to auto-advance the cycle day.
function schoolDaysSince(fromISO) {
  if (!fromISO) return 0;
  const from = new Date(fromISO + 'T00:00:00');
  const to = new Date(todayISO() + 'T00:00:00');
  if (to <= from) return 0;
  let count = 0;
  const d = new Date(from);
  while (d < to) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd >= 1 && wd <= 5) count++;
  }
  return count;
}

// Which timetable day applies today?
// week mode  -> weekday
// cycle mode -> anchor day auto-advanced by elapsed school days
//               (admin can correct it on the Absences page, e.g.
//               after holidays, and the anchor resets to today)
export function currentDay(school) {
  if (school.timetable_mode !== 'cycle') return weekdayIndex();
  const advance = schoolDaysSince(school.cycle_day_date);
  const len = school.cycle_length || 1;
  return ((school.current_cycle_day - 1 + advance) % len) + 1;
}
