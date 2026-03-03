#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SCHEMA_PATH="${REPO_ROOT}/apps/api/prisma/schema.prisma"

AUTO_DB_UP=0
if [[ "${1:-}" == "--with-docker" ]]; then
  AUTO_DB_UP=1
  shift
fi

cd "${REPO_ROOT}"

if [[ -z "${DATABASE_URL:-}" && -f "${REPO_ROOT}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${REPO_ROOT}/.env"
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is missing. Set it or create ${REPO_ROOT}/.env from .env.example." >&2
  exit 1
fi

if [[ "${AUTO_DB_UP}" == "1" ]]; then
  if command -v docker >/dev/null 2>&1; then
    echo "Starting local PostgreSQL via docker compose..."
    npm run db:up >/dev/null
  else
    echo "--with-docker was requested but docker is not installed." >&2
    exit 1
  fi
fi

echo "Running DB preflight checks..."
bash "${REPO_ROOT}/scripts/wait-for-db.sh" "${SCHEMA_PATH}" 45 2

npm run db:generate >/dev/null
npx prisma db push --schema "${SCHEMA_PATH}" --skip-generate >/dev/null

echo "Running API integration tests..."
npm run test -w apps/api -- "$@"
