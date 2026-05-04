# SmartShift Pro — Gestione Turni Sanitari

## Overview

pnpm workspace monorepo (TypeScript) + Python Flask PWA for healthcare shift management.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Frontend**: React + Vite (TypeScript), dark navy + gold glassmorphism theme
- **Backend**: Python Flask + SQLAlchemy + SQLite
- **Port routing**: Flask on 5000 → proxied at `/flask-api`; React Vite dev server at `/`
- **PDF exports**: reportlab

## Flask App — Gestione Turni

- **Location**: `flask-app/app.py` (≈950 lines)
- **Database**: `flask-app/gestione_turni.db` (SQLite)
- **Workflow**: "artifacts/api-server: Flask API"

### Models
- `Dipendente` — staff with role, stats, preferences, admin flag, password_changed
- `Turno` — shift with tipo, ore, manuale flag (locked from regen), data
- `Assenza` — sick/vacation periods per employee (MALATTIA | FERIE)
- `RichiestaScambio` — swap requests between staff

### Shift Types
MATTINO (7h), POMERIGGIO (7h), NOTTE (10h), SMONTO (0h), FERIE (0h), MALATTIA (0h), RIPOSO (0h)

### Generation Rules
- **Admin (Orlando, is_admin=True)**: Fixed MATTINO 07:00–14:00, RIPOSO every Sunday
- **Infermiera (Anna)**: MATTINO only, RIPOSO alternating Sat/Sun
- **OSS**: Full rotation — min 3 MATTINO, 2 POMERIGGIO, 1 NOTTE per day
  - Night eligibility = `'NOTTE' in preferenze_turno`
  - Chain: NOTTE → SMONTO next day → RIPOSO day after
- **Ausiliario**: 07:00–15:00 (8h), min 1/day, never counted for OSS coverage
- **Absences**: Pre-assigned MALATTIA/FERIE shifts exclude staff from coverage
- **Locked shifts**: `manuale=True` turni are never overwritten by generator

### API Endpoints (all at /flask-api/api/...)
- Auth: `/login`, `/logout`, `/me`, `/change_password`, `/online`
- Staff: `/dipendenti` CRUD, `/dipendenti/:id/preferenze`
- Turni: GET/POST `/turni`, PUT/DELETE `/turni/:id`, POST `/turni/genera`, POST `/turni/genera_giorno`
- Assenze: GET/POST `/assenze`, DELETE `/assenze/:id`
- Scambi: GET/POST `/scambi`, PUT `/scambi/:id/gestisci`
- Reports: GET `/genera_report_mensile`
- Stats: GET `/statistiche`

## React App

- **Location**: `artifacts/gestione-turni-react/src/`
- **Workflow**: "artifacts/gestione-turni-react: web"

### Pages
- `/login` — Login
- `/dashboard` — Personal stats + staff table (admin/Caposala can click staff to manage preferences & assenze)
- `/turni` — Day-grouped shift list; 🔒 icon for manuale shifts; admin inline edit
- `/genera` — Generate shifts: Giorno Singolo | Settimana | Mese
- `/griglia` — **NEW** Weekly/monthly pivot grid (Admin + Caposala only); compact MAT/POM/NOT/SMO/FER/MAL/RIP cells
- `/scambi` — Swap requests
- `/caposala` — Caposala management area
- `/monitor` — Admin-only online monitoring (30s polling)

### Key Components
- `ShiftBadge` — badge for all 7 shift types incl. SMONTO (violet)
- `RoleBadge` — compact abbreviated labels: OSS, INF, AUS, CAP, DEV
- `AppLayout` — sidebar nav; Griglia shown for Admin + Caposala

## Staff

**Admin**: Orlando (is_admin=True, DEV role)
**Infermiera**: Anna
**OSS**: Carmen, Elena, Barbara (night-eligible), Vittoria, Stefania, Ioana, Roberto, Stefania 2
**Ausiliario**: Fabiana, Marina, Angela
**Caposala**: Caposala

Default passwords: `[name]password123`, Caposala: `caposala123`

## DB Migrations (auto-run on startup)
Handled in `__main__` block via `ALTER TABLE` + `db.create_all()`.
Added columns: `preferenze_turno`, `password_changed`, `last_login`, `last_seen` (dipendente); `manuale` (turno); `assenza` table.
