// ============================================================
// Absence reason codes — single-letter codes stored in
// absences.reason; full labels shown wherever a human reads them.
// ============================================================

export const REASON_CODES = ['S', 'L', 'P', 'F', 'T', 'O'];

export const REASON_LABELS = {
  S: 'Sick',
  L: 'Late',
  P: 'Personal',
  F: 'Family Responsibility',
  T: 'Training / Workshop',
  O: 'Other',
};

// One-line legend for the printed sheets (sentence case, wall-readable).
export const REASON_LEGEND =
  'S = Sick   L = Late   P = Personal   F = Family responsibility   T = Training / workshop   O = Other';

export function reasonLabel(code) {
  return REASON_LABELS[code] || '';
}
