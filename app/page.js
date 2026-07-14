'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { allocateCovers } from '../lib/engine';
import TeachersTab from '../components/TeachersTab';
import AbsencesTab from '../components/AbsencesTab';
import ReviewTab from '../components/ReviewTab';
import PrintTab from '../components/PrintTab';
import SettingsTab from '../components/SettingsTab';
import { todayISO, todayDayIndex } from '../lib/day';

const TABS = [
  { key: 'teachers', label: 'Teachers & Timetables', step: 1 },
  { key: 'absences', label: "Today's Absences", step: 2 },
  { key: 'review', label: 'Review Covers', step: 3 },
  { key: 'print', label: 'Print Sheet', step: 4 },
  { key: 'settings', label: 'Settings', step: '⚙' },
];

export default function App() {
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState('teachers');

  // core data
  const [school, setSchool] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [slots, setSlots] = useState([]); // all timetable_slots rows
  const [absences, setAbsences] = useState([]); // today's rows
  const [covers, setCovers] = useState([]); // today's cover_assignments
  const [recentCounts, setRecentCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [showReset, setShowReset] = useState(false);

  // ---------- auth ----------
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // ---------- data loading ----------
  const firstLoad = useRef(true);
  const loadAll = useCallback(async () => {
    if (firstLoad.current) setLoading(true); // full loading screen only once
    setErr('');
    try {
      const [{ data: sch }, { data: t }, { data: sl }] = await Promise.all([
        supabase.from('schools').select('*').limit(1).single(),
        supabase.from('teachers').select('*').eq('active', true).order('name'),
        supabase.from('timetable_slots').select('*'),
      ]);
      setSchool(sch);
      setTeachers(t || []);
      setSlots(sl || []);

      const date = todayISO();
      const [{ data: abs }, { data: cov }] = await Promise.all([
        supabase.from('absences').select('*').eq('date', date),
        supabase.from('cover_assignments').select('*').eq('date', date).order('period'),
      ]);
      setAbsences(abs || []);
      setCovers(cov || []);

      // fairness lookback: covers in the last 14 days
      const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
      const { data: recent } = await supabase
        .from('cover_assignments')
        .select('cover_teacher_id')
        .gte('date', since)
        .not('cover_teacher_id', 'is', null);
      const counts = {};
      (recent || []).forEach((r) => {
        counts[r.cover_teacher_id] = (counts[r.cover_teacher_id] || 0) + 1;
      });
      setRecentCounts(counts);
    } catch (e) {
      setErr('Could not load data: ' + e.message);
    }
    setLoading(false);
    firstLoad.current = false;
  }, []);

  useEffect(() => {
    if (session) loadAll();
  }, [session, loadAll]);

  // ---------- generate ----------
  async function generate() {
    const dow = todayDayIndex(school);
    const date = todayISO();

    const slotsByTeacher = {};
    teachers.forEach((t) => (slotsByTeacher[t.id] = {}));
    slots
      .filter((s) => s.day_of_week === dow)
      .forEach((s) => {
        if (slotsByTeacher[s.teacher_id])
          slotsByTeacher[s.teacher_id][s.period] = s;
      });

    const absMap = {};
    absences.forEach((a) => (absMap[a.teacher_id] = new Set(a.periods)));
    if (Object.keys(absMap).length === 0) {
      alert('Mark at least one teacher absent first.');
      return;
    }

    const result = allocateCovers({
      teachers,
      slotsByTeacher,
      absences: absMap,
      recentCoverCounts: recentCounts,
      periodsPerDay: school.periods_per_day,
      dailyCap: school.daily_cover_cap,
    });

    // replace today's assignments
    await supabase.from('cover_assignments').delete().eq('date', date);
    const rows = result
      .filter((r) => !r.wasFree)
      .map((r) => ({
        school_id: school.id,
        date,
        period: r.period,
        absent_teacher_id: r.absentTeacherId,
        cover_teacher_id: r.coverTeacherId,
        class_name: r.className,
        room: r.room,
      }));
    if (rows.length) {
      const { error } = await supabase.from('cover_assignments').insert(rows);
      if (error) { setErr(error.message); return; }
    }
    await loadAll();
    setTab('review');
  }

  // ---------- reset (password-confirmed, in-app modal) ----------
  async function performReset(password) {
    const email = session?.user?.email;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return 'Incorrect password. Nothing was reset.';
    await supabase.from('cover_assignments').delete().eq('school_id', school.id);
    await supabase.from('absences').delete().eq('school_id', school.id);
    await supabase.from('timetable_slots').delete().eq('school_id', school.id);
    await supabase.from('teachers').delete().eq('school_id', school.id);
    await loadAll();
    setTab('teachers');
    setShowReset(false);
    return null; // success
  }

  // ---------- render ----------
  if (!session) return <LoginGate />;

  return (
    <>
      <div className="topbar">
        <div className="logo"><div className="box">▦</div> ReliefDesk</div>
        <div className="school">
          {school?.name || 'School'} · {session.user.email}
          <button className="signout danger" onClick={() => setShowReset(true)}>Reset all</button>
          <button className="signout" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            <span className="step">{t.step}</span>{t.label}
          </button>
        ))}
      </nav>

      <main>
        {err && <p className="err">{err}</p>}
        {loading ? (
          <div className="empty">Loading…</div>
        ) : (
          <>
            {tab === 'teachers' && (
              <TeachersTab school={school} teachers={teachers} slots={slots}
                recentCounts={recentCounts} reload={loadAll} />
            )}
            {tab === 'absences' && (
              <AbsencesTab school={school} teachers={teachers} absences={absences}
                reload={loadAll} onGenerate={generate} />
            )}
            {tab === 'review' && (
              <ReviewTab school={school} teachers={teachers} covers={covers}
                absences={absences} slots={slots} reload={loadAll}
                goPrint={() => setTab('print')} />
            )}
            {tab === 'print' && (
              <PrintTab school={school} teachers={teachers} covers={covers} absences={absences} />
            )}
            {tab === 'settings' && (
              <SettingsTab school={school} reload={loadAll} />
            )}
          </>
        )}
      </main>
      {showReset && (
        <ResetModal onCancel={() => setShowReset(false)} onConfirm={performReset} />
      )}
    </>
  );
}

function ResetModal({ onCancel, onConfirm }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function go() {
    if (!pw) { setErr('Enter your admin password to confirm.'); return; }
    setBusy(true); setErr('');
    const result = await onConfirm(pw);
    if (result) { setErr(result); setBusy(false); }
  }

  return (
    <div className="gate" style={{ background: 'rgba(15,42,67,0.75)' }}>
      <div className="login-card">
        <h3 style={{ fontFamily: 'var(--display)', color: 'var(--red)', marginBottom: 8 }}>
          ⚠ Reset everything?
        </h3>
        <p>
          This permanently deletes <strong>all teachers, timetables, absences and
          cover history</strong> for this school. It cannot be undone.
        </p>
        <label className="f">Admin password</label>
        <input type="password" value={pw} autoFocus
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && go()} />
        {err && <p className="err">{err}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn ghost" style={{ flex: 1 }} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn red" style={{ flex: 1 }} onClick={go} disabled={busy}>
            {busy ? 'Resetting…' : 'Yes, wipe it all'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LoginGate() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function login() {
    setBusy(true); setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) setErr(error.message);
    setBusy(false);
  }

  return (
    <div className="gate">
      <div className="login-card">
        <div className="logo"><div className="box">▦</div> ReliefDesk</div>
        <p>Admin sign-in</p>
        <label className="f">Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="f">Password</label>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && login()} />
        {err && <p className="err">{err}</p>}
        <button className="btn" style={{ width: '100%' }} onClick={login} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
      </div>
    </div>
  );
}
