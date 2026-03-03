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
    echo "docker not found; skipping automatic db startup." >&2
  fi
fi

echo "Running DB preflight checks..."
TMP_SQL="$(mktemp)"
trap 'rm -f "${TMP_SQL}"' EXIT
printf "SELECT 1;\n" > "${TMP_SQL}"

if ! npx prisma db execute --schema "${SCHEMA_PATH}" --file "${TMP_SQL}" >/dev/null; then
  echo "Database connectivity check failed. Verify PostgreSQL is running and DATABASE_URL is correct." >&2
  exit 1
fi

npx prisma db push --schema "${SCHEMA_PATH}" --skip-generate >/dev/null

echo "Running API integration tests..."
npm run test -w apps/api -- "$@"
