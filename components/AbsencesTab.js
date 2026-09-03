'use client';

import { supabase } from '../lib/supabaseClient';
import { todayISO, todayDayIndex, dayLabel, dayCount, periodList, periodLabel } from '../lib/day';
import { REASON_CODES, REASON_LABELS } from '../lib/reasons';

export default function AbsencesTab({ school, teachers, absences, reloadToday, reloadSchool, onGenerate }) {
  const date = todayISO();
  const absMap = {};
  absences.forEach((a) => (absMap[a.teacher_id] = a));

  async function setCycleDay(v) {
    await supabase.from('schools')
      .update({ current_cycle_day: parseInt(v, 10) })
      .eq('id', school.id);
    await reloadSchool();
  }

  async function toggleAbsent(t, checked) {
    if (checked) {
      await supabase.from('absences').insert({
        school_id: school.id,
        teacher_id: t.id,
        date,
        periods: periodList(school),
      });
    } else {
      await supabase.from('absences').delete().eq('teacher_id', t.id).eq('date', date);
    }
    await reloadToday();
  }

  async function setReason(t, code) {
    const row = absMap[t.id];
    if (!row) return;
    await supabase.from('absences').update({ reason: code }).eq('id', row.id);
    await reloadToday();
  }

  async function togglePeriod(t, p) {
    const row = absMap[t.id];
    if (!row) return;
    const set = new Set(row.periods);
    set.has(p) ? set.delete(p) : set.add(p);
    const arr = [...set].sort((a, b) => a - b);
    if (arr.length === 0) {
      await supabase.from('absences').delete().eq('id', row.id);
    } else {
      await supabase.from('absences').update({ periods: arr }).eq('id', row.id);
    }
    await reloadToday();
  }

  const dateLabel = new Date().toLocaleDateString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <section>
      <h2>Today&apos;s Absences — {dateLabel}</h2>
      <p className="sub">
        Tick who is absent. All lessons are selected by default; untick lessons for
        partial absences (e.g. a teacher who leaves after L5).
      </p>

      {school.timetable_mode === 'cycle' && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderLeft: '4px solid var(--cobalt)' }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>📅 Today is:</span>
          <select value={todayDayIndex(school)} onChange={(e) => setCycleDay(e.target.value)}>
            {Array.from({ length: dayCount(school) }, (_, i) => (
              <option key={i + 1} value={i + 1}>{dayLabel(school, i + 1)}</option>
            ))}
          </select>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            Covers are generated from this day's timetable — confirm it each morning.
          </span>
        </div>
      )}

      <div className="card">
        {teachers.length === 0 ? (
          <div className="empty">Add teachers first on the Teachers tab.</div>
        ) : (
          teachers.map((t) => {
            const row = absMap[t.id];
            return (
              <div key={t.id} className={`abs-row ${row ? 'absent' : ''}`}>
                <label className="name">
                  <input type="checkbox" checked={!!row}
                    onChange={(e) => toggleAbsent(t, e.target.checked)} />
                  {t.name}
                  <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12 }}>
                    · {t.subject || '—'}
                  </span>
                </label>
                {row && (
                  <>
                    <div className="period-picker">
                      {periodList(school).map((p) => {
                        const on = row.periods.includes(p);
                        return (
                          <button key={p} className={`pbtn ${on ? 'on' : ''}`}
                            style={p === 0 || p === 99 ? { width: 'auto', padding: '0 8px' } : {}}
                            onClick={() => togglePeriod(t, p)}>{periodLabel(p)}</button>
                        );
                      })}
                    </div>
                    <select
                      value={row.reason || ''}
                      onChange={(e) => setReason(t, e.target.value)}
                      style={{ maxWidth: 200 }}
                    >
                      <option value="">Reason…</option>
                      {REASON_CODES.map((c) => (
                        <option key={c} value={c}>{REASON_LABELS[c]}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: 13.5 }}>
          ⚖ Max cover lessons per teacher per day: <strong>{school.daily_cover_cap}</strong>
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          Change this in Settings. You can still override any assignment manually in Review.
        </span>
      </div>

      <button className="btn green" onClick={onGenerate}>
        Generate Cover Assignments →
      </button>
    </section>
  );
}
