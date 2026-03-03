# Backup and Restore Runbook

## Backup policy

- Full PostgreSQL backup: daily
- Point-in-time recovery (WAL): enabled
- Retention: 30 days
- Monthly restore drill in staging

## Restore procedure (staging dry-run)

1. Pick backup timestamp and confirm source environment.
2. Provision fresh staging DB instance.
3. Restore backup into staging DB.
4. Update staging `DATABASE_URL`.
5. Run smoke checks:
   - `GET /healthz`
   - `GET /readyz`
   - `GET /v1/teams` with valid token
6. Validate row counts for critical tables:
   - `User`, `Team`, `Plan`, `PlanRevision`, `ImportJob`

## Production recovery

1. Declare incident and freeze writes (maintenance mode).
2. Restore latest consistent backup to new DB target.
3. Repoint API to restored DB.
4. Run readiness + domain verification checks.
5. Re-enable writes.
6. Publish incident summary with RPO/RTO.
