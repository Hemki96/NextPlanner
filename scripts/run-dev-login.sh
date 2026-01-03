#!/usr/bin/env bash
set -euo pipefail

export NODE_ENV=${NODE_ENV:-development}
export NEXTPLANNER_LOGIN_USER=${NEXTPLANNER_LOGIN_USER:-admin}
export NEXTPLANNER_LOGIN_PASSWORD=${NEXTPLANNER_LOGIN_PASSWORD:-DevPass123!}

echo "Starte NextPlanner im DEV-Modus mit Benutzer \"${NEXTPLANNER_LOGIN_USER}\"."
echo "Anmeldung testen unter http://localhost:3000 (Passwort: ${NEXTPLANNER_LOGIN_PASSWORD})."

npm run dev
