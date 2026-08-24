'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { allocateCovers } from '../lib/engine';
import TeachersTab from '../components/TeachersTab';
import AbsencesTab from '../components/AbsencesTab';
import ReviewTab from '../components/ReviewTab';
import PrintTab from '../components/PrintTab';
import SettingsTab from '../components/SettingsTab';
import { todayISO, todayDayIndex, periodList } from '../lib/day';

const TABS = [
  { key: 'teachers', label: 'Teachers & Timetables', step: 1 },
  { key: 'absences', label: "Today's Absences", step: 2 },
  { key: 'review', label: 'Review Covers', step: 3 },
  { key: 'print', label: 'Print Sheet', step: 4 },
  { key: 'settings', label: 'Settings', step: '⚙' },
];

async function fetchAllTimetableSlots() {
  const PAGE_SIZE = 1000;
  let from = 0;
  let all = [];
  while (true) {
    const { data, error } = await supabase
      .from('timetable_slots')
      .select('*')
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    all = all.concat(data || []);
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { data: all, error: null };
}

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
    if (!session) return;
    if (firstLoad.current) setLoading(true); // full loading screen only once
    setErr('');
    try {
      console.log('LOAD START');
      const { data: sch } = await supabase
        .from('schools')
        .select('*, school_admins!inner(user_id)')
        .eq('school_admins.user_id', session.user.id)
        .single();
      const [{ data: t }, { data: sl }] = await Promise.all([
        supabase.from('teachers').select('*').eq('active', true).order('name'),
        fetchAllTimetableSlots(),
      ]);
      setSchool(sch);
      setTeachers(t || []);
      setSlots(sl || []);
      console.log('LOAD MID: school+teachers+slots done', sch, t?.length, sl?.length);
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
      console.error('LOAD ERROR:', e);
      setErr('Could not load data: ' + e.message);
    }
    setLoading(false);
    firstLoad.current = false;
  }, [session]);

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
      periods: periodList(school),
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
        <div className="logo"><Logo size={28} /> ReliefDesk</div>
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

function Logo({ size = 34 }) {
  // 3x3 timetable grid; the cobalt cell = the cover slot, filled.
  const u = size / 3.6;
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-label="ReliefDesk logo">
      <rect x="1" y="1" width="34" height="34" rx="7" fill="#0F2A43" />
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => (
          <rect key={`${r}${c}`} x={6 + c * 9} y={6 + r * 9} width="7" height="7" rx="1.6"
            fill={r === 1 && c === 2 ? '#1D6FD1' : 'rgba(255,255,255,0.28)'} />
        ))
      )}
    </svg>
  );
}

function LoginGate() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function login() {
    if (!emailValid) { setErr('Enter a valid email address (e.g. name@school.co.za).'); return; }
    if (!pw) { setErr('Enter your password.'); return; }
    setBusy(true); setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) setErr(error.message);
    setBusy(false);
  }

  return (
    <div className="gate">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Logo size={54} />
          <div className="logo" style={{ color: 'var(--navy)', fontSize: 24 }}>ReliefDesk</div>
        </div>
        <p style={{ marginBottom: 4 }}>Relief cover, sorted before first bell.</p>
        <p style={{ fontSize: 12, marginBottom: 18 }}>Admin sign-in</p>
        <div style={{ textAlign: 'left' }}>
        <label className="f">Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && login()} />
        <label className="f">Password</label>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input type={showPw ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && login()}
            style={{ width: '100%', paddingRight: 44 }} />
                    <button type="button" onClick={() => setShowPw(!showPw)}
            aria-label={showPw ? 'Hide password' : 'Show password'}
            style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              height: 20, width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--muted)',
              lineHeight: 0,
            }}>
            {showPw ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.7 18.7 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.7 18.7 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            )}
          </button>
        </div>
        {err && <p className="err">{err}</p>}
        <button className="btn" style={{ width: '100%', marginTop: 14 }} onClick={login} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
        </div>
      </div>
    </div>
  );
}
