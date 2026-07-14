// ============================================================
// Day helpers — week mode vs cycle mode
// ============================================================

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Returns how many "days" the timetable has for this school
export function dayCount(school) {
  return school.timetable_mode === 'cycle' ? school.cycle_days : 5;
}

// Label for a given day index (1-based)
export function dayLabel(school, index) {
  if (school.timetable_mode === 'cycle') return `Day ${index}`;
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][index - 1];
}

// Which day index applies today?
// Week mode: derived from the calendar (weekends map to Monday so the
// admin can prep ahead). Cycle mode: whatever the admin confirmed on
// the Absences page (stored on the school row).
export function todayDayIndex(school) {
  if (school.timetable_mode === 'cycle') {
    const d = school.current_cycle_day || 1;
    return Math.min(Math.max(d, 1), school.cycle_days);
  }
  const dow = new Date().getDay();
  return dow >= 1 && dow <= 5 ? dow : 1;
}
