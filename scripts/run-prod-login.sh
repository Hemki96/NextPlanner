#!/usr/bin/env bash
set -euo pipefail

export NODE_ENV=production
export NEXTPLANNER_LOGIN_USER=${NEXTPLANNER_LOGIN_USER:-admin}

if [ -z "${NEXTPLANNER_LOGIN_PASSWORD:-}" ]; then
  echo "Bitte setze NEXTPLANNER_LOGIN_PASSWORD für den Produktionsstart." >&2
  exit 1
fi

export NEXTPLANNER_DATA_DIR=${NEXTPLANNER_DATA_DIR:-"./data"}

echo "Starte NextPlanner im PROD-Modus als \"${NEXTPLANNER_LOGIN_USER}\" mit Datenordner ${NEXTPLANNER_DATA_DIR}."

npm start
