# Environments

## Targets

- `dev`: local development with Docker PostgreSQL
- `staging`: managed cloud stack, production-like, smoke tests + UAT
- `prod`: managed cloud stack, customer traffic

## Required environment variables

- `DATABASE_URL`
- `PORT`
- `CORS_ORIGINS`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `ACCESS_TOKEN_TTL_SECONDS`
- `REFRESH_TOKEN_TTL_SECONDS`
- `POLL_INTERVAL_MS`
- `LOG_LEVEL`

## Promotion flow

1. Merge to `main`.
2. Deploy automatically to `staging`.
3. Run API tests (`npm run test:api`) and smoke checks (`/healthz`, `/readyz`, `/metrics`).
4. Manual approval.
5. Deploy to `prod`.

## Rollback

1. Redeploy previous API image/build.
2. Restore DB from latest valid backup if required.
3. Re-run readiness and smoke tests.
