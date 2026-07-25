'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { dayCount, dayLabel, periodList, periodLabel } from '../lib/day';

export default function TeachersTab({ school, teachers, slots, recentCounts, reload }) {
  const [editing, setEditing] = useState(null);
  const [newName, setNewName] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [busy, setBusy] = useState(false);

  async function addTeacher() {
    if (!newName.trim()) return;
    setBusy(true);
    await supabase.from('teachers').insert({
      school_id: school.id,
      name: newName.trim(),
      subject: newSubject.trim(),
    });
    setNewName(''); setNewSubject('');
    await reload();
    setBusy(false);
  }

  return (
    <section>
      <h2>Teachers &amp; Timetables</h2>
      <p className="sub">
        One-time setup, editable any time. Click a teacher to open their timetable grid —
        type straight into the cells, or paste a whole timetable from Excel.
      </p>

      <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label className="f">Name</label>
          <input type="text" value={newName} placeholder="e.g. Mrs Naidoo"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTeacher()} />
        </div>
        <div>
          <label className="f">Subject</label>
          <input type="text" value={newSubject} placeholder="e.g. Mathematics"
            onChange={(e) => setNewSubject(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTeacher()} />
        </div>
        <button className="btn" onClick={addTeacher} disabled={busy || !newName.trim()}>
          + Add Teacher
        </button>
      </div>

      {teachers.length === 0 ? (
        <div className="empty">No teachers yet — add your staff above to get started.</div>
      ) : (
        <div className="teacher-grid">
          {teachers.map((t) => {
            const tSlots = slots.filter((s) => s.teacher_id === t.id);
            return (
              <div key={t.id} className="tcard"
                style={editing?.id === t.id ? { borderColor: 'var(--cobalt)' } : {}}
                onClick={() => setEditing(editing?.id === t.id ? null : t)}>
                <div className="tname">{t.name}</div>
                <div className="tsub">{t.subject || '—'}</div>
                <div className="tload">
                  <span>Covers last 14d: <strong>{recentCounts[t.id] || 0}</strong></span>
                  <span className="pill">{tSlots.length} lessons</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <GridEditor key={editing.id} school={school} teacher={editing}
          slots={slots} reload={reload} onClose={() => setEditing(null)} />
      )}
    </section>
  );
}

// ============================================================
// Inline grid editor: rows = days, columns = lessons.
// Cell format: "Class, Room" (e.g. "9B, Room 12"). Empty = FREE.
// Supports pasting a block straight from Excel/Google Sheets.
// ============================================================
function GridEditor({ school, teacher, slots, reload, onClose }) {
  const days = dayCount(school);
  const periods = school.periods_per_day;
  const [grid, setGrid] = useState({}); // "d-p" -> text
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(teacher.name);
  const [savingName, setSavingName] = useState(false);

  // load existing slots into the grid
  useEffect(() => {
    const g = {};
    slots
      .filter((s) => s.teacher_id === teacher.id)
      .forEach((s) => {
        g[`${s.day_of_week}-${s.period}`] =
          s.room ? `${s.class_name}, ${s.room}` : s.class_name;
      });
    setGrid(g);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacher.id]);

  function setCell(d, p, val) {
    setGrid((g) => ({ ...g, [`${d}-${p}`]: val }));
    setDirty(true);
  }

  // Paste a block from Excel: rows = days, columns = lessons,
  // starting from the cell the paste happens in.
  function handlePaste(e, startD, startP) {
    const text = e.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.includes('\n')) return; // single value: default paste
    e.preventDefault();
    const rows = text.replace(/\r/g, '').split('\n');
    setGrid((g) => {
      const next = { ...g };
      rows.forEach((row, ri) => {
        const d = startD + ri;
        if (d > days) return;
        row.split('\t').forEach((cell, ci) => {
          const p = startP + ci;
          if (p > periods) return;
          next[`${d}-${p}`] = cell.trim();
        });
      });
      return next;
    });
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setMsg('');
    // Build desired rows from the grid
    const desired = [];
    for (let d = 1; d <= days; d++) {
      for (const p of periodList(school)) {
        const raw = (grid[`${d}-${p}`] || '').trim();
        if (!raw) continue;
        const [cls, ...roomParts] = raw.split(',');
        desired.push({
          school_id: school.id,
          teacher_id: teacher.id,
          day_of_week: d,
          period: p,
          class_name: cls.trim(),
          room: roomParts.join(',').trim(),
        });
      }
    }
    // Simple + reliable: replace this teacher's slots wholesale
    const { error: delErr } = await supabase
      .from('timetable_slots').delete().eq('teacher_id', teacher.id);
    if (delErr) { setMsg(delErr.message); setSaving(false); return; }
    if (desired.length) {
      const { error: insErr } = await supabase.from('timetable_slots').insert(desired);
      if (insErr) { setMsg(insErr.message); setSaving(false); return; }
    }
    await reload();
    setDirty(false);
    setSaving(false);
    setMsg('✓ Timetable saved.');
  }

  async function saveName() {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setSavingName(true);
    await supabase.from('teachers').update({ name: trimmed }).eq('id', teacher.id);
    await reload();
    setSavingName(false);
    setEditingName(false);
  }

  function cancelName() {
    setNameInput(teacher.name);
    setEditingName(false);
  }

  async function removeTeacher() {
    if (!confirm(`Remove ${teacher.name}? Their timetable and history go too.`)) return;
    await supabase.from('teachers').delete().eq('id', teacher.id);
    onClose();
    await reload();
  }

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        {editingName ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="text" value={nameInput} autoFocus
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveName()}
              style={{ fontFamily: 'var(--display)', fontSize: 16, padding: '6px 10px' }} />
            <button className="btn" onClick={saveName} disabled={savingName || !nameInput.trim()}>
              {savingName ? 'Saving…' : 'Save'}
            </button>
            <button className="btn ghost" onClick={cancelName} disabled={savingName}>Cancel</button>
          </div>
        ) : (
          <h3 style={{ fontFamily: 'var(--display)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {teacher.name} — timetable
            <button className="btn ghost" onClick={() => setEditingName(true)}
              style={{ padding: '2px 8px', fontSize: 11.5, fontWeight: 600 }}>
              ✎ Edit name
            </button>
          </h3>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
            onClick={removeTeacher}>Remove teacher</button>
        </div>
      </div>

      <div className="tt-wrap">
        <table className="tt">
          <thead>
            <tr>
              <th></th>
              {periodList(school).map((p) => <th key={p}>{periodLabel(p)}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: days }, (_, di) => {
              const d = di + 1;
              return (
                <tr key={d}>
                  <th>{dayLabel(school, d)}</th>
                  {periodList(school).map((p) => {
                    const val = grid[`${d}-${p}`] || '';
                    return (
                      <td key={p} style={{ padding: 3 }}>
                        <input
                          type="text"
                          value={val}
                          placeholder="FREE"
                          onChange={(e) => setCell(d, p, e.target.value)}
                          onPaste={(e) => handlePaste(e, d, p)}
                          style={{
                            width: '100%', minWidth: 90, border: '1px solid transparent',
                            borderRadius: 4, padding: '6px 6px', fontSize: 12.5,
                            background: val ? '#fff' : 'transparent',
                            fontStyle: val ? 'normal' : 'italic',
                          }}
                          onFocus={(e) => (e.target.style.border = '1px solid var(--cobalt)')}
                          onBlur={(e) => (e.target.style.border = '1px solid transparent')}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="hint">
        Type “Class, Room” in a cell (e.g. <strong>9B, Room 12</strong>) — leave empty for FREE.
        Use <strong>Tab</strong> to jump to the next cell. You can also copy a block from
        Excel/Google Sheets and paste it into the top-left cell of where it belongs — rows are
        days, columns are lessons.
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
        <button className="btn green" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Saving…' : dirty ? 'Save timetable' : 'Saved ✓'}
        </button>
        <button className="btn ghost" onClick={onClose}>Close</button>
        {msg && <span className={msg.startsWith('✓') ? 'ok' : 'err'}>{msg}</span>}
        {dirty && <span className="hint" style={{ margin: 0 }}>Unsaved changes</span>}
      </div>
    </div>
  );
}
