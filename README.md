# ReliefDesk

Daily teacher cover assignments — automated, fair, and printed for the corridor wall.

The admin enters teachers' weekly timetables once. Each morning they tick who's
absent, hit Generate, review, and print the cover sheet. The engine assigns
covers fairness-first (fewest covers in the last 14 days), respects a daily cap
per teacher, and flags any slot it can't fill as SEE OFFICE.

## Stack
- **Next.js 14** (App Router, JavaScript)
- **Supabase** — Postgres database + authentication
- **Vercel** — free hosting

## Setup (once, ~20 minutes)

### 1. Supabase
1. Create a free account at supabase.com and create a new project.
2. In the project: **SQL Editor → New query** → paste the whole of
   `supabase/schema.sql` → **Run**. This creates all tables and a school row.
3. **Authentication → Users → Add user**: create the admin login
   (e.g. admin@yourschool.co.za + a strong password). Untick "send email
   confirmation" if you just want it active immediately.
4. **Project Settings → API**: copy the Project URL and the `anon public` key.

### 2. Local run
```bash
npm install
cp .env.example .env.local   # then paste your URL + anon key into it
npm run dev                   # opens on http://localhost:3000
```
Sign in with the admin user you created. Add a couple of teachers, fill some
timetable cells, mark an absence, generate, print — the whole flow should work.

### 3. Deploy (Vercel)
1. Push this folder to a GitHub repo.
2. vercel.com → New Project → import the repo.
3. Add the two environment variables (same names/values as `.env.local`).
4. Deploy. You'll get a URL like `reliefdesk.vercel.app` — that's what you give
   the school. (Custom domain like reliefdesk.co.za can be attached later.)

## Daily use (what the school admin does)
1. Sign in → **Today's Absences** → tick who's out (untick lessons for partial
   absence, e.g. leaves after L5).
2. **Generate Cover Assignments**.
3. **Review** — override any pick from the dropdown if needed.
4. **Print Sheet** → print (landscape A4) → stick it on the wall. Done.

## Key design decisions
- **Fairness first**: candidates ranked by covers in the last 14 days plus
  today's load; subject match breaks ties.
- **Daily cap** is a school setting (Settings tab). The engine never exceeds it;
  the admin can, knowingly, via override.
- **NO COVER FOUND / SEE OFFICE**: when every teacher is teaching, absent,
  capped, or already covering, the system says so loudly instead of silently
  breaking its own rules.
- **Multi-tenant ready**: every table carries `school_id`. Going multi-school
  later = per-school users + tighter RLS policies, not a schema rewrite.
- **Weekend behaviour**: on Sat/Sun the app shows Monday's timetable so the
  admin can prepare ahead.

## Roadmap candidates (post-pilot)
- SMS/WhatsApp notification to the covering teacher
- School-name/logo on the printed sheet header (name is already there)
- Day-1/Day-2 cycle timetables (some schools rotate instead of Mon–Fri)
- Absence history & fairness report (covers per teacher per term)
- Multi-school accounts (the actual subscription product)
