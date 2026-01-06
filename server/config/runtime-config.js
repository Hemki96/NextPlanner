// Schlanke Laufzeitkonfiguration: reduziert auf die nötigsten Variablen für
// einen einfachen Login-Flow.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(CURRENT_DIR, "..", "..");
const DEFAULT_DATA_DIR = path.join(PROJECT_ROOT, "data");
const SESSION_COOKIE_NAME = "nextplanner_session";

class RuntimeConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "RuntimeConfigError";
  }
}

const DEFAULT_ALLOWED_ORIGINS = Object.freeze(["http://localhost:3000"]);
const DEFAULTS = Object.freeze({
  port: 3000,
  sessionTtlMs: 1000 * 60 * 60 * 12,
});

function parseIntEnv(name, value, { min = null } = {}) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be a number.`);
  }
  if (min !== null && parsed < min) {
    throw new Error(`Environment variable ${name} must be >= ${min}.`);
  }
  return parsed;
}

function parseBooleanEnv(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
}

function parseAllowedOrigins(value) {
  if (!value) {
    return DEFAULT_ALLOWED_ORIGINS;
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveDataDir(value) {
  if (!value) {
    return DEFAULT_DATA_DIR;
  }
  if (path.isAbsolute(value)) {
    return value;
  }
  return path.resolve(PROJECT_ROOT, value);
}

function isPermissionError(error) {
  return error?.code === "EACCES" || error?.code === "EPERM";
}

function ensureWritableDataDir(requestedDir, fallbackDir, warnings, errors) {
  try {
    fs.mkdirSync(requestedDir, { recursive: true });
    fs.accessSync(requestedDir, fs.constants.W_OK);
    return requestedDir;
  } catch (error) {
    if (isPermissionError(error) && fallbackDir && requestedDir !== fallbackDir) {
      try {
        fs.mkdirSync(fallbackDir, { recursive: true });
        fs.accessSync(fallbackDir, fs.constants.W_OK);
        warnings.push(
          `Configured data directory "${requestedDir}" is not writable (${error.code ?? "EACCES"}). Falling back to "${fallbackDir}".`,
        );
        return fallbackDir;
      } catch (fallbackError) {
        const reason = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        errors.push(
          `Configured data directory "${requestedDir}" is not writable (${error.code ?? "EACCES"}), and fallback "${fallbackDir}" is not usable: ${reason}.`,
        );
        return requestedDir;
      }
    }
    const reason = error instanceof Error ? error.message : String(error);
    errors.push(`Data directory "${requestedDir}" cannot be used: ${reason}`);
    return requestedDir;
  }
}

const STATIC_USERS = Object.freeze({
  admin: { username: "admin", password: "admin", roles: ["admin"] },
  coach: { username: "coach", password: "coach", roles: ["coach"] },
  athlet: { username: "athlet", password: "athlet", roles: ["athlet"] },
});

function buildRuntimeConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV ?? "development";
  const isProduction = nodeEnv === "production";
  const isDevelopment = nodeEnv === "development";
  const errors = [];
  const warnings = [];
  const safeParse = (label, fn) => {
    try {
      return fn();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `${label} is invalid`);
      return null;
    }
  };

  const port = safeParse("PORT", () => parseIntEnv("PORT", env.PORT, { min: 0 })) ?? DEFAULTS.port;
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const sessionTtlMs =
    safeParse("SESSION_TTL_MS", () => parseIntEnv("SESSION_TTL_MS", env.SESSION_TTL_MS, { min: 1000 })) ??
    DEFAULTS.sessionTtlMs;
  const cookieSecureOverride = parseBooleanEnv(env.COOKIE_SECURE);
  const defaults = STATIC_USERS;
  const resolvedDataDir = resolveDataDir(env.NEXTPLANNER_DATA_DIR ?? env.DATA_DIR);
  const dataDir = ensureWritableDataDir(resolvedDataDir, DEFAULT_DATA_DIR, warnings, errors);

  if (errors.length > 0) {
    const unique = Array.from(new Set(errors));
    throw new RuntimeConfigError(`Invalid runtime config:\n- ${unique.join("\n- ")}`);
  }

  return {
    env: {
      nodeEnv,
      isProduction,
      isDevelopment,
    },
    server: {
      port,
      allowedOrigins,
      jsonSpacing: nodeEnv === "development" ? 2 : 0,
    },
    security: {
      session: {
        ttlMs: sessionTtlMs,
        cookieName: SESSION_COOKIE_NAME,
        secureCookies: cookieSecureOverride ?? null,
      },
      defaultUsers: defaults,
    },
    paths: {
      projectRoot: PROJECT_ROOT,
      dataDir,
      defaultDataDir: DEFAULT_DATA_DIR,
    },
    warnings: Object.freeze([...new Set(warnings)]),
  };
}

const runtimeConfig = buildRuntimeConfig();

export { runtimeConfig, buildRuntimeConfig, RuntimeConfigError, PROJECT_ROOT, DEFAULT_DATA_DIR };
