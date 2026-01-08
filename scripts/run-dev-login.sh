#!/usr/bin/env bash
set -euo pipefail

export NODE_ENV=${NODE_ENV:-development}
export NEXTPLANNER_DATA_DIR=${NEXTPLANNER_DATA_DIR:-"./data"}

now=$(date -Iseconds)

mkdir -p "${NEXTPLANNER_DATA_DIR}"

cat >"${NEXTPLANNER_DATA_DIR}/plans.json" <<EOF
{
  "nextId": 2,
  "plans": [
    {
      "id": 1,
      "title": "Beispielplan",
      "content": "Aufwärmen\\n4x50 Technik\\n200 locker",
      "planDate": "2024-01-01",
      "focus": "AR",
      "metadata": { "coach": "Demo" },
      "createdAt": "${now}",
      "updatedAt": "${now}",
      "createdByUserId": "demo",
      "updatedByUserId": "demo"
    }
  ]
}
EOF

cat >"${NEXTPLANNER_DATA_DIR}/templates.json" <<EOF
{
  "templates": [
    {
      "id": "template-sample-1",
      "type": "Block",
      "title": "Sprintblock",
      "notes": "Kurz und knackig",
      "content": "## Sprint\\n4x50m All-Out\\n",
      "tags": ["Sprint", "Kurz"],
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
      "title": "Warmup",
      "description": "Schneller Start",
      "sortOrder": 0,
      "items": [
        {
          "label": "200m locker",
          "snippet": "200m locker\\n",
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

echo "Starte NextPlanner im DEV-Modus mit Beispieldaten."

npm run dev
