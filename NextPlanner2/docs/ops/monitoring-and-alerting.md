# Monitoring and Alerting

## Health endpoints

- Liveness: `GET /healthz`
- Readiness: `GET /readyz`
- Metrics: `GET /metrics` (Prometheus format)

## Core metrics

- `nextplanner2_http_requests_total`
- `nextplanner2_http_request_duration_seconds`
- Process/runtime default metrics from `prom-client`

## Logging

- Structured JSON logs via `pino`
- Required fields: `traceId`, `method`, `route`, `statusCode`, `durationMs`
- Error logs include stack/error payload and `traceId`

## Recommended alerts

- `readyz` failing for 2 consecutive checks
- 5xx rate > 2% for 5 minutes
- p95 latency > 800ms for 10 minutes
- DB connection failures > 0 for 5 minutes

## Operational SLO baseline

- API availability >= 99.5% monthly
- p95 API latency <= 500ms for list/create/update endpoints
