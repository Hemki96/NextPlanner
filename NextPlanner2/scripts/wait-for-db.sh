#!/usr/bin/env bash
set -euo pipefail

SCHEMA_PATH="${1:-apps/api/prisma/schema.prisma}"
MAX_RETRIES="${2:-30}"
SLEEP_SECONDS="${3:-2}"

TMP_SQL="$(mktemp)"
trap 'rm -f "${TMP_SQL}"' EXIT
printf "SELECT 1;\n" > "${TMP_SQL}"

for (( attempt=1; attempt<=MAX_RETRIES; attempt++ )); do
  if npx prisma db execute --schema "${SCHEMA_PATH}" --file "${TMP_SQL}" >/dev/null 2>&1; then
    echo "Database is reachable (attempt ${attempt}/${MAX_RETRIES})."
    exit 0
  fi

  echo "Waiting for database... (${attempt}/${MAX_RETRIES})"
  sleep "${SLEEP_SECONDS}"
done

echo "Database did not become reachable in time." >&2
exit 1
