'use client';

import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function SettingsTab({ school, reloadSchool }) {
  const [name, setName] = useState(school.name);
  const [periods, setPeriods] = useState(school.periods_per_day);
  const [cap, setCap] = useState(school.daily_cover_cap);
  const [mode, setMode] = useState(school.timetable_mode || 'week');
  const [cycleDays, setCycleDays] = useState(school.cycle_days || 10);
  const [msg, setMsg] = useState('');

  async function save() {
    setMsg('');
    const p = parseInt(periods, 10);
    const c = parseInt(cap, 10);
    if (!name.trim() || isNaN(p) || p < 1 || p > 12 || isNaN(c) || c < 1) {
      setMsg('Please check the values — name required, periods 1–12, cap at least 1.');
      return;
    }
    const cd = parseInt(cycleDays, 10);
    if (mode === 'cycle' && (isNaN(cd) || cd < 2 || cd > 14)) {
      setMsg('Cycle length must be between 2 and 14 days.');
      return;
    }
    const { error } = await supabase.from('schools').update({
      name: name.trim(),
      periods_per_day: p,
      daily_cover_cap: c,
      timetable_mode: mode,
      cycle_days: mode === 'cycle' ? cd : (school.cycle_days || 10),
    }).eq('id', school.id);
    if (error) { setMsg(error.message); return; }
    await reloadSchool();
    setMsg('✓ Saved.');
  }

  return (
    <section>
      <h2>Settings</h2>
      <p className="sub">School-wide settings. The school name appears on the printed wall sheet.</p>

      <div className="card" style={{ maxWidth: 460 }}>
        <label className="f">School name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
          style={{ width: '100%', marginBottom: 14 }} />

        <label className="f">Lessons per day</label>
        <input type="number" min="1" max="12" value={periods}
          onChange={(e) => setPeriods(e.target.value)}
          style={{ width: 100, marginBottom: 14 }} />

        <label className="f">Timetable type</label>
        <select value={mode} onChange={(e) => setMode(e.target.value)}
          style={{ marginBottom: 14, display: 'block' }}>
          <option value="week">Week (Monday–Friday)</option>
          <option value="cycle">Day cycle (Day 1, Day 2, …)</option>
        </select>
        {mode === 'cycle' && (
          <>
            <label className="f">Number of days in the cycle</label>
            <input type="number" min="2" max="14" value={cycleDays}
              onChange={(e) => setCycleDays(e.target.value)}
              style={{ width: 100, marginBottom: 6 }} />
            <p className="hint" style={{ marginBottom: 14 }}>
              Each morning you confirm which cycle day it is on the Absences page.
              Switching between Week and Cycle keeps your entered timetables for
              days 1–5, but do double-check them after switching.
            </p>
          </>
        )}

        <label className="f">Max cover lessons per teacher per day</label>
        <input type="number" min="1" max="12" value={cap}
          onChange={(e) => setCap(e.target.value)}
          style={{ width: 100, marginBottom: 14 }} />
        <p className="hint" style={{ marginBottom: 14 }}>
          The engine never auto-assigns anyone more than this. Manual overrides in Review can still exceed it.
        </p>

        {msg && <p className={msg.startsWith('✓') ? 'ok' : 'err'}>{msg}</p>}
        <button className="btn" onClick={save}>Save Settings</button>
      </div>

      <div className="card" style={{ maxWidth: 460 }}>
        <label className="f">Heads-up on lowering lessons per day</label>
        <p className="hint">
          If you reduce lessons per day after timetables are entered, existing slots in the
          removed periods stay in the database but won&apos;t be shown or used. Increase it
          back and they reappear.
        </p>
      </div>
    </section>
  );
}
