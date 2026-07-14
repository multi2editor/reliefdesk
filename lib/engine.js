// ============================================================
// ReliefDesk allocation engine
// Pure function: no database calls, fully testable.
// ============================================================
//
// Inputs:
//   teachers:  [{ id, name, subject }]
//   slotsByTeacher: { [teacherId]: { [period]: {class_name, room} } }
//                   (today's day only; missing period = FREE)
//   absences:  { [teacherId]: Set<period> }   periods are 1-based
//   recentCoverCounts: { [teacherId]: number } covers in last 14 days
//   periodsPerDay: number
//   dailyCap: number
//
// Output: array of assignment rows:
//   { absentTeacherId, period, className, room,
//     coverTeacherId | null, wasFree }
// ============================================================

export function allocateCovers({
  teachers,
  slotsByTeacher,
  absences,
  recentCoverCounts,
  periodsPerDay,
  dailyCap,
}) {
  const absentIds = Object.keys(absences);
  const todayLoad = {};
  teachers.forEach((t) => (todayLoad[t.id] = 0));
  const assignments = [];

  // Period-by-period so the daily cap holds across simultaneous absences
  for (let p = 1; p <= periodsPerDay; p++) {
    for (const absentId of absentIds) {
      if (!absences[absentId].has(p)) continue;

      const absentTeacher = teachers.find((t) => t.id === absentId);
      const slot = slotsByTeacher[absentId]?.[p];

      // Absent teacher had no class this period — nothing to cover
      if (!slot) {
        assignments.push({
          absentTeacherId: absentId,
          period: p,
          className: '',
          room: '',
          coverTeacherId: null,
          wasFree: true,
        });
        continue;
      }

      // Candidates: not the absent teacher, not absent this period,
      // FREE this period, under the daily cap, not already covering
      // another class this same period.
      const busyThisPeriod = new Set(
        assignments
          .filter((a) => a.period === p && a.coverTeacherId)
          .map((a) => a.coverTeacherId)
      );

      const candidates = teachers.filter((t) => {
        if (t.id === absentId) return false;
        if (absences[t.id]?.has(p)) return false;
        if (slotsByTeacher[t.id]?.[p]) return false; // teaching own class
        if (todayLoad[t.id] >= dailyCap) return false;
        if (busyThisPeriod.has(t.id)) return false;
        return true;
      });

      // Fairness: fewest (recent covers + today's load) first;
      // subject match breaks ties.
      candidates.sort((a, b) => {
        const la = (recentCoverCounts[a.id] || 0) + todayLoad[a.id];
        const lb = (recentCoverCounts[b.id] || 0) + todayLoad[b.id];
        if (la !== lb) return la - lb;
        const sa = a.subject === absentTeacher.subject ? 0 : 1;
        const sb = b.subject === absentTeacher.subject ? 0 : 1;
        return sa - sb;
      });

      const pick = candidates[0] || null;
      if (pick) todayLoad[pick.id] += 1;

      assignments.push({
        absentTeacherId: absentId,
        period: p,
        className: slot.class_name,
        room: slot.room,
        coverTeacherId: pick ? pick.id : null, // null => NO COVER FOUND
        wasFree: false,
      });
    }
  }

  return assignments;
}
