import type { NextFunction, Request, Response } from "express";
import pino from "pino";
import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export const appLogger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime
});

const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry });

const httpRequestsTotal = new Counter({
  name: "nextplanner2_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status"] as const,
  registers: [metricsRegistry]
});

const httpRequestDurationSeconds = new Histogram({
  name: "nextplanner2_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [metricsRegistry]
});

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const end = process.hrtime.bigint();
    const durationSeconds = Number(end - start) / 1_000_000_000;
    const status = String(res.statusCode);
    const route = req.route?.path || req.path || "unknown";

    httpRequestsTotal.inc({
      method: req.method,
      route,
      status
    });

    httpRequestDurationSeconds.observe(
      {
        method: req.method,
        route,
        status
      },
      durationSeconds
    );

    appLogger.info({
      traceId: res.locals.traceId,
      method: req.method,
      route,
      statusCode: res.statusCode,
      durationMs: Math.round(durationSeconds * 1000),
      remoteIp: req.ip
    }, "request.finished");
  });

  next();
}

export async function getMetricsText(): Promise<string> {
  return metricsRegistry.metrics();
}

export function metricsContentType(): string {
  return metricsRegistry.contentType;
}
