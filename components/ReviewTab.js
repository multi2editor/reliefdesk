'use client';

import { supabase } from '../lib/supabaseClient';
import { todayDayIndex, periodLabelLong } from '../lib/day';

export default function ReviewTab({ school, teachers, covers, absences, slots, reloadToday, goPrint }) {
  const byId = Object.fromEntries(teachers.map((t) => [t.id, t]));
  const absMap = {};
  absences.forEach((a) => (absMap[a.teacher_id] = new Set(a.periods)));
  const absentIds = [...new Set(covers.map((c) => c.absent_teacher_id))];
  const dow = todayDayIndex(school);

  // teachers free at a given period today (for the override dropdown)
  function freeAt(period, absentId, currentCoverId) {
    const teaching = new Set(
      slots.filter((s) => s.day_of_week === dow && s.period === period).map((s) => s.teacher_id)
    );
    // already assigned as cover for another absent teacher this same period
    // (exclude the row being edited — that teacher is still valid for their own slot)
    const alreadyCovering = new Set(
      covers
        .filter((c) => c.period === period && c.cover_teacher_id && c.id !== currentCoverId)
        .map((c) => c.cover_teacher_id)
    );
    return teachers.filter(
      (t) =>
        t.id !== absentId &&
        !teaching.has(t.id) &&
        !absMap[t.id]?.has(period) &&
        !alreadyCovering.has(t.id)
    );
  }

  async function override(cover, newTeacherId) {
    if (!newTeacherId) return;
    await supabase.from('cover_assignments')
      .update({ cover_teacher_id: newTeacherId, overridden: true })
      .eq('id', cover.id);
    await reloadToday();
  }

  if (covers.length === 0) {
    return (
      <section>
        <h2>Review Cover Assignments</h2>
        <div className="empty">
          No covers generated yet for today. Go to <strong>Today&apos;s Absences</strong>,
          mark who&apos;s out, and hit Generate.
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2>Review Cover Assignments</h2>
      <p className="sub">
        Assigned fairness-first (fewest covers in the last 14 days), max{' '}
        <strong>{school.daily_cover_cap} cover lessons per teacher per day</strong>.
        Override anything below before printing — overrides are allowed even past the cap.
      </p>
      <div className="fair-note">
        ⚖ Fairness engine active — overrides are recorded so the history stays honest.
      </div>

      {absentIds.map((aid) => {
        const t = byId[aid];
        const rows = covers.filter((c) => c.absent_teacher_id === aid);
        return (
          <div key={aid} className="rev-block">
            <h3>{t?.name || 'Unknown'} — absent</h3>
            <table className="rev">
              <thead>
                <tr><th>Lesson</th><th>Class</th><th>Room</th><th>Cover Teacher</th><th>Override</th></tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const cov = c.cover_teacher_id ? byId[c.cover_teacher_id] : null;
                  const options = freeAt(c.period, aid, c.id);
                  return (
                    <tr key={c.id}>
                      <td><strong>{periodLabelLong(c.period)}</strong></td>
                      <td>{c.class_name}</td>
                      <td>{c.room}</td>
                      <td>
                        {cov
                          ? <span className="cover-tag">{cov.name}{c.overridden ? ' *' : ''}</span>
                          : <span className="nocover">NO COVER FOUND</span>}
                      </td>
                      <td>
                        <select defaultValue="" onChange={(e) => override(c, e.target.value)}>
                          <option value="">— change —</option>
                          {options.map((o) => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      <p className="hint" style={{ marginBottom: 14 }}>* = manually overridden by admin</p>
      <button className="btn green" onClick={goPrint}>Looks good → Print Sheet</button>
    </section>
  );
}
