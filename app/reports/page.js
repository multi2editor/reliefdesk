'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { periodLabelLong } from '../../lib/day';
import { REASON_CODES, REASON_LEGEND, reasonLabel } from '../../lib/reasons';

// "YYYY-MM" for the current calendar month
function currentYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Date range [start, next) covering the whole month named by ym
function monthBounds(ym) {
  const [y, m] = ym.split('-').map(Number);
  const start = `${ym}-01`;
  const next =
    m === 12
      ? `${y + 1}-01-01`
      : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { start, next };
}

function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-ZA', {
    month: 'long',
    year: 'numeric',
  });
}

function fmtDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export default function ReportsPage() {
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [ym, setYm] = useState(currentYM());
  const [school, setSchool] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [covers, setCovers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [drill, setDrill] = useState(null); // teacher id, or null for the overview

  // ---------- auth ----------
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // ---------- data (scoped to the selected month, independent of the daily app) ----------
  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setErr('');
    try {
      const { data: sch } = await supabase
        .from('schools')
        .select('*, school_admins!inner(user_id)')
        .eq('school_admins.user_id', session.user.id)
        .single();
      const { start, next } = monthBounds(ym);
      const [{ data: t }, { data: abs }, { data: cov }] = await Promise.all([
        supabase.from('teachers').select('*').order('name'),
        supabase.from('absences').select('*').gte('date', start).lt('date', next),
        supabase
          .from('cover_assignments')
          .select('*')
          .gte('date', start)
          .lt('date', next),
      ]);
      setSchool(sch);
      setTeachers(t || []);
      setAbsences(abs || []);
      setCovers(cov || []);
    } catch (e) {
      setErr('Could not load report data: ' + e.message);
    }
    setLoading(false);
  }, [session, ym]);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  // ---------- delete a mistakenly-logged absence (and the covers it spawned) ----------
  const deleteAbsence = useCallback(
    async (absence) => {
      setErr('');
      try {
        const { error: e1 } = await supabase
          .from('absences')
          .delete()
          .eq('id', absence.id);
        if (e1) throw e1;
        // covers only existed because of this absence — remove them for the same teacher + date
        const { error: e2 } = await supabase
          .from('cover_assignments')
          .delete()
          .eq('absent_teacher_id', absence.teacher_id)
          .eq('date', absence.date);
        if (e2) throw e2;
        await load();
      } catch (e) {
        setErr('Could not delete absence: ' + e.message);
      }
    },
    [load]
  );

  useEffect(() => {
    setDrill(null); // leaving a teacher's detail view when the month changes
  }, [ym]);

  // ---------- gates ----------
  if (session === undefined) {
    return (
      <div className="report-page">
        <div className="report-inner">
          <div className="empty">Loading…</div>
        </div>
      </div>
    );
  }
  if (session === null) {
    return (
      <div className="report-page">
        <div className="report-inner">
          <div className="empty">
            Please <a href="/">sign in</a> to view reports.
          </div>
        </div>
      </div>
    );
  }

  const byId = Object.fromEntries(teachers.map((t) => [t.id, t]));
  const activeTeachers = teachers.filter((t) => t.active);

  // per-teacher totals + reason breakdown for the month
  const agg = {};
  activeTeachers.forEach((t) => {
    agg[t.id] = { total: 0, S: 0, L: 0, P: 0, F: 0, T: 0, O: 0 };
  });
  absences.forEach((a) => {
    const row = agg[a.teacher_id];
    if (!row) return; // absence belongs to an inactive teacher — not listed in the overview
    row.total += 1;
    if (a.reason && row[a.reason] !== undefined) row[a.reason] += 1;
  });

  return (
    <div className="report-page">
      <div className="topbar">
        <div className="logo"><Logo size={28} /> ReliefDesk</div>
        <a className="topbar-link" href="/">← Back to app</a>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#A9BCD2' }}>
          Monthly Report
        </span>
      </div>

      <div className="report-inner">
        {err && <p className="err">{err}</p>}

        <h2>Monthly Absence Report</h2>
        <p className="sub">
          Every active teacher for the selected month, with a breakdown by reason.
          Click a teacher to see their individual absences and who covered.
        </p>

        <div className="report-picker">
          <label className="f" htmlFor="ym">Month</label>
          <input
            id="ym"
            type="month"
            value={ym}
            max={currentYM()}
            onChange={(e) => e.target.value && setYm(e.target.value)}
            style={{ width: 180 }}
          />
        </div>

        {loading ? (
          <div className="empty">Loading…</div>
        ) : drill ? (
          <TeacherDetail
            teacher={byId[drill]}
            ym={ym}
            absences={absences.filter((a) => a.teacher_id === drill)}
            covers={covers}
            byId={byId}
            onBack={() => setDrill(null)}
            onDelete={deleteAbsence}
          />
        ) : (
          <>
            <div className="print-actions">
              <button className="btn" onClick={() => window.print()}>
                🖨 Print / Save as PDF
              </button>
            </div>
            <div className="sheet">
              <div className="s-head">
                <h1>Monthly Absence Report</h1>
                <div className="s-date">
                  {school?.name} · {monthLabel(ym)}
                </div>
              </div>
              <div className="sheet-scroll">
                <table className="print">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', paddingLeft: 12 }}>Teacher</th>
                      <th>Days Absent</th>
                      {REASON_CODES.map((c) => <th key={c}>{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {activeTeachers.length === 0 ? (
                      <tr>
                        <td colSpan={2 + REASON_CODES.length} className="dash">
                          No active teachers.
                        </td>
                      </tr>
                    ) : (
                      activeTeachers.map((t) => {
                        const a = agg[t.id];
                        return (
                          <tr
                            key={t.id}
                            className="report-row"
                            onClick={() => setDrill(t.id)}
                          >
                            <td className="absname">{t.name}</td>
                            <td>{a.total || '—'}</td>
                            {REASON_CODES.map((c) => (
                              <td key={c}>{a[c] || '—'}</td>
                            ))}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <div className="s-foot">
                <span>Counts are days absent in the month (raw absence records).</span>
                <span>Generated by ReliefDesk</span>
              </div>
              <div className="s-legend">{REASON_LEGEND}</div>
            </div>
            <p className="report-hint">Tip: click any teacher row to drill into their dates.</p>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// View B — one teacher's absences for the month, with cover detail.
// Reuses .rev-block / table.rev from the Review tab.
// ============================================================
function TeacherDetail({ teacher, ym, absences, covers, byId, onBack, onDelete }) {
  const rows = [...absences].sort((a, b) => a.date.localeCompare(b.date));

  function coveredBy(date, period) {
    const c = covers.find(
      (x) =>
        x.absent_teacher_id === teacher?.id &&
        x.date === date &&
        x.period === period
    );
    if (!c) return '—';
    if (!c.cover_teacher_id) return 'SEE OFFICE';
    return byId[c.cover_teacher_id]?.name || '—';
  }

  return (
    <div className="rev-block">
      <button
        className="btn ghost"
        style={{ marginBottom: 14 }}
        onClick={onBack}
      >
        ← Back to overview
      </button>
      <h3>{teacher?.name || 'Unknown'} — {monthLabel(ym)}</h3>
      {rows.length === 0 ? (
        <div className="empty">No absences recorded this month.</div>
      ) : (
        <table className="rev">
          <thead>
            <tr>
              <th>Date</th>
              <th>Reason</th>
              <th>Periods affected</th>
              <th>Covered by</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const periods = [...(a.periods || [])].sort((m, n) => m - n);
              return (
                <tr key={a.id}>
                  <td>{fmtDate(a.date)}</td>
                  <td>{reasonLabel(a.reason) || '—'}</td>
                  <td>{periods.map((p) => periodLabelLong(p)).join(', ') || '—'}</td>
                  <td>
                    {periods.map((p) => (
                      <div key={p}>
                        {periodLabelLong(p)}: {coveredBy(a.date, p)}
                      </div>
                    ))}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      className="btn ghost"
                      title="Remove this absence"
                      onClick={() => {
                        if (
                          confirm(
                            `Remove ${teacher?.name || 'this teacher'}'s absence on ${fmtDate(
                              a.date
                            )}?\n\nThis also deletes any cover assignments that were created for that day.`
                          )
                        ) {
                          onDelete(a);
                        }
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-label="ReliefDesk logo">
      <rect x="1" y="1" width="34" height="34" rx="7" fill="#0F2A43" />
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => (
          <rect
            key={`${r}${c}`}
            x={6 + c * 9}
            y={6 + r * 9}
            width="7"
            height="7"
            rx="1.6"
            fill={r === 1 && c === 2 ? '#1D6FD1' : 'rgba(255,255,255,0.28)'}
          />
        ))
      )}
    </svg>
  );
}
