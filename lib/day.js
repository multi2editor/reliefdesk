// ============================================================
// Day helpers — week mode vs cycle mode
// ============================================================

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export const REG_AM = 0;
export const REG_PM = 99;

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

// Ordered list of real periods for this school, including registration
// slots (period 0 = Reg AM, period 99 = Reg PM) when enabled.
export function periodList(school) {
  const list = [];
  if (school.has_registration) list.push(REG_AM);
  for (let p = 1; p <= school.periods_per_day; p++) list.push(p);
  if (school.has_registration) list.push(REG_PM);
  return list;
}

export function periodLabel(p) {
  if (p === REG_AM) return 'Reg';
  if (p === REG_PM) return 'Reg';
  return `L${p}`;
}

export function periodLabelLong(p) {
  if (p === REG_AM) return 'Reg (AM)';
  if (p === REG_PM) return 'Reg (PM)';
  return `L${p}`;
}
