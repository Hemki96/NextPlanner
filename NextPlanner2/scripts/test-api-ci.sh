#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SCHEMA_PATH="${REPO_ROOT}/apps/api/prisma/schema.prisma"

cd "${REPO_ROOT}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required in CI." >&2
  exit 1
fi

bash "${REPO_ROOT}/scripts/wait-for-db.sh" "${SCHEMA_PATH}" 45 2

npm run db:generate >/dev/null
npx prisma db push --schema "${SCHEMA_PATH}" --skip-generate >/dev/null
npm run test:api
