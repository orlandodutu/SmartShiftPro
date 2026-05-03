# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.
Also includes a Python Flask web application for shift management (Gestione Turni).

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Flask App — Gestione Turni

A Python Flask shift management system for a healthcare team.

- **Location**: `flask-app/`
- **Port**: 5000
- **Workflow**: "Gestione Turni"
- **Database**: SQLite (`flask-app/gestione_turni.db`)
- **Dependencies**: flask, flask-cors, flask-sqlalchemy, reportlab

### Features
- Login system (default password: `password123`)
- Dashboard with personal stats (ore, notti, ferie, malattia)
- Shift management (add/delete shifts by type: MATTINO, POMERIGGIO, NOTTE, FERIE, MALATTIA, RIPOSO)
- Staff management (admin only — Orlando)
- PDF report generation per month

### Staff
Orlando (DEV, admin), Fabiana/Marina/Angela (PULIZIE), Carmen/Roberto/Barbara/Vittoria/Stefania 2/Stefania/Ioana/Elena (OSS), Anna (INFERMIERA)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
