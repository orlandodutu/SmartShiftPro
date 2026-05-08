# SmartShift Pro — Gestione Turni Sanitari

## Overview

pnpm workspace monorepo (TypeScript) + Python Flask PWA for healthcare shift management.
Single admin: **Giustina** (username: `giustina`, password: `MASTER_PASSWORD` secret).

## Stack

- **Monorepo tool**: pnpm workspaces
- **Frontend**: React + Vite (TypeScript), dark navy + gold / light white + healthcare green theme toggle
- **Backend**: Python Flask + SQLAlchemy + SQLite
- **Port routing**: Flask on 5000 → proxied at `/flask-api`; React Vite dev server at `/`

## Flask App — Gestione Turni

- **Location**: `flask-app/app.py` (~1900 lines)
- **Database**: `flask-app/gestione_turni.db` (SQLite)
- **Workflow**: "artifacts/api-server: Flask API"

### Models
- `Dipendente` — staff with role, stats, preferences, admin flag, password_changed
- `Turno` — shift with tipo, ore, manuale flag (locked from regen), data
- `Assenza` — sick/vacation periods per employee (MALATTIA | FERIE)

### Shift Types
MATTINO (7h), POMERIGGIO (7h), NOTTE (10h), SMONTO (0h), FERIE (0h), MALATTIA (0h), RIPOSO (0h)

### Generation Rules
- **Admin (Giustina, is_admin=True)**: Fixed MATTINO 07:00–14:00, RIPOSO every Sunday
- **Infermiera**: MATTINO only, RIPOSO alternating Sat/Sun
- **OSS**: Full rotation — min 3 MATTINO, 2 POMERIGGIO, 1 NOTTE per day
  - Night eligibility = `'NOTTE' in preferenze_turno`
  - Chain: NOTTE → SMONTO next day → RIPOSO day after
- **Ausiliario**: 07:00–15:00 (7h), min 1/day, never counted for OSS coverage
- **Absences**: Pre-assigned MALATTIA/FERIE shifts exclude staff from coverage
- **Locked shifts**: `manuale=True` turni are never overwritten by generator
- **Past-shift memory**: `_genera_interno` pre-seeds `tipo_count` from last 30 days before start date so MAT/POM alternation is remembered across month/week boundaries

### API Endpoints (all at /flask-api/api/...)
- Auth: `/login`, `/logout`, `/me`, `/change_password`, `/online`
- Staff: `/dipendenti` CRUD, `/dipendenti/:id/preferenze`
- Turni: GET/POST `/turni`, PUT/DELETE `/turni/:id`, POST `/turni/genera`, POST `/turni/genera_giorno`
- **NEW**: POST `/turni/pianifica_dipendente` — generates shifts for a newly added employee from today to end of month
- Assenze: GET/POST `/assenze`, DELETE `/assenze/:id`
- Reports: GET `/genera_report_mensile`
- Stats: GET `/statistiche`

## React App

- **Location**: `artifacts/gestione-turni-react/src/`
- **Workflow**: "artifacts/gestione-turni-react: web"
- **Theme**: `ThemeContext.tsx` — dark (default) / light; persisted in localStorage; `data-theme="light"` on `<html>`

### Pages
- `/login` — Login (username: giustina + MASTER_PASSWORD)
- `/dashboard` — Staff table with ⚡ auto-schedule icon per employee; banner for newly added employees
- `/turni` — Day-grouped shift list; 🔒 icon for manuale shifts; admin inline edit
- `/genera` — Generate shifts: Giorno Singolo | Settimana | Mese
- `/griglia` — Weekly/monthly pivot grid (Admin only); print view is clean white background grouped by role
- `/caposala` — Caposala management: assenze registration with auto-turni patching

### Key Components
- `ShiftBadge` — badge for all 7 shift types incl. SMONTO (violet)
- `RoleBadge` — compact abbreviated labels: OSS, INF, AUS, CAP, DEV
- `AppLayout` — sidebar nav with sun/moon theme toggle button
- `ThemeContext` — dark navy+gold / light white+green (#059669) CSS variable system

### CSS Tokens (index.css)
- `--btn-primary-bg` — gold gradient (dark) / green gradient (light)
- `--btn-primary-color` — #0f172a (dark) / #ffffff (light)
- `--sticky-col-bg` — #0c1428 (dark) / #f0faf5 (light)
- `--active-nav-*` — amber (dark) / emerald (light)

## DB Migrations (auto-run on startup)
Handled in `__main__` block via `ALTER TABLE` + `db.create_all()`.
Added columns: `preferenze_turno`, `password_changed`, `last_login`, `last_seen` (dipendente); `manuale` (turno); `assenza` table.
