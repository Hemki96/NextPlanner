#!/usr/bin/env bash
set -euo pipefail

export NODE_ENV=production
export NEXTPLANNER_LOGIN_USER=${NEXTPLANNER_LOGIN_USER:-admin}

if [ -z "${NEXTPLANNER_LOGIN_PASSWORD:-}" ]; then
  echo "Bitte setze NEXTPLANNER_LOGIN_PASSWORD für den Produktionsstart." >&2
  exit 1
fi

export NEXTPLANNER_DATA_DIR=${NEXTPLANNER_DATA_DIR:-"./data"}

now=$(date -Iseconds)

mkdir -p "${NEXTPLANNER_DATA_DIR}"

cat >"${NEXTPLANNER_DATA_DIR}/plans.json" <<EOF
{
  "nextId": 2,
  "plans": [
    {
      "id": 1,
      "title": "Beispielplan (PROD)",
      "content": "Aufwärmen\\n6x50 GA1\\n200 locker",
      "planDate": "2024-02-01",
      "focus": "GA",
      "metadata": { "coach": "Prod-Demo" },
      "createdAt": "${now}",
      "updatedAt": "${now}",
      "createdByUserId": "prod-demo",
      "updatedByUserId": "prod-demo"
    }
  ]
}
EOF

cat >"${NEXTPLANNER_DATA_DIR}/templates.json" <<EOF
{
  "templates": [
    {
      "id": "template-prod-1",
      "type": "Set",
      "title": "Grundlagenausdauer",
      "notes": "Ruhiges Rollen",
      "content": "6x200m GA1\\nPause 20s\\n",
      "tags": ["GA", "Ausdauer"],
      "createdAt": "${now}",
      "updatedAt": "${now}"
    }
  ]
}
EOF

cat >"${NEXTPLANNER_DATA_DIR}/team-snippets.json" <<EOF
{
  "updatedAt": "${now}",
  "groups": [
    {
      "title": "Basics",
      "description": "Schnellstart für Prod-Demos",
      "sortOrder": 0,
      "items": [
        {
          "label": "Einfaches Warmup",
          "snippet": "300m locker, Technikdrills nach Wahl\\n",
          "ensureLineBreakBefore": false,
          "appendNewline": true,
          "ensureBlankLineAfter": false,
          "cursorOffset": 0
        }
      ]
    }
  ]
}
EOF

echo "Starte NextPlanner im PROD-Modus als \"${NEXTPLANNER_LOGIN_USER}\" mit Datenordner ${NEXTPLANNER_DATA_DIR}."

npm start
