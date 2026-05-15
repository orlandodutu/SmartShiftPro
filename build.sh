#!/bin/bash
set -e

# 1. Python deps
pip install -r flask-app/requirements.txt

# 2. Scarica pnpm standalone in /tmp per evitare read-only /usr/bin
curl -fsSL https://github.com/pnpm/pnpm/releases/download/v9.15.0/pnpm-linux-x64 -o /tmp/pnpm
chmod +x /tmp/pnpm

# 3. Installa dipendenze JS senza scripts per sicurezza
/tmp/pnpm install --ignore-scripts

# 4. Build frontend
cd artifacts/gestione-turni-react
PORT=5173 BASE_PATH=/ /tmp/pnpm exec vite build --config vite.config.ts
