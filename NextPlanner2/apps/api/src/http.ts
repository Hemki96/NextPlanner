import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { ApiErrorCode } from "@nextplanner2/shared";
import { appLogger } from "./observability.js";

export class AppError extends Error {
  status: number;
  code: ApiErrorCode;
  details?: unknown;

  constructor(status: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function traceIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const traceId = req.header("x-trace-id")?.trim() || randomUUID();
  res.locals.traceId = traceId;
  res.setHeader("x-trace-id", traceId);
  next();
}

export function fail(
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown
): never {
  throw new AppError(status, code, message, details);
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const traceId = (res.locals.traceId as string | undefined) ?? randomUUID();

  if (error instanceof AppError) {
    res.status(error.status).json({
      code: error.code,
      message: error.message,
      details: error.details,
      traceId
    });
    return;
  }

  appLogger.error(
    {
      traceId,
      error
    },
    "request.failed"
  );
  res.status(500).json({
    code: "INTERNAL_SERVER_ERROR",
    message: "Unexpected server error.",
    traceId
  });
}

export function asyncRoute<T extends Request>(handler: (req: T, res: Response) => Promise<unknown>) {
  return (req: T, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}
