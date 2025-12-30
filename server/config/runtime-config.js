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
  loginRateLimit: {
    windowMs: 1000 * 60 * 5,
    maxAttempts: 5,
    blockDurationMs: 1000 * 60 * 5,
  },
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
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
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
          `Configured data directory "${requestedDir}" is not writable (${error.code ?? "EACCES"}). Falling back to "${fallbackDir}". ` +
            "Set NEXTPLANNER_DATA_DIR (or DATA_DIR) to a writable path to persist data outside the project folder.",
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

function validateDefaultCredentials(env, isProduction, errors) {
  const adminUser = env.NEXTPLANNER_ADMIN_USER ?? env.ADMIN_USER ?? "admin";
  const adminPassword =
    env.NEXTPLANNER_ADMIN_PASSWORD ??
    env.ADMIN_PASSWORD ??
    (isProduction ? "" : "Admin1234!");
  const editorUser = env.NEXTPLANNER_EDITOR_USER ?? "coach";
  const editorPassword = env.NEXTPLANNER_EDITOR_PASSWORD ?? (isProduction ? "" : "CoachPower#2024");
  const userUser = env.NEXTPLANNER_USER ?? "athlete";
  const userPassword =
    env.NEXTPLANNER_USER_PASSWORD ?? (isProduction ? "" : "AthleteReady#2024");

  if (isProduction) {
    const missing = [];
    if (!adminPassword) missing.push("NEXTPLANNER_ADMIN_PASSWORD");
    if (!editorPassword) missing.push("NEXTPLANNER_EDITOR_PASSWORD");
    if (!userPassword) missing.push("NEXTPLANNER_USER_PASSWORD");
    if (missing.length > 0) {
      errors.push(`Missing required credentials in production. Please set ${missing.join(", ")}.`);
    }
  }

  return {
    admin: { username: adminUser, password: adminPassword, roles: ["admin"] },
    editor: { username: editorUser, password: editorPassword, roles: ["editor"] },
    user: { username: userUser, password: userPassword, roles: ["user"] },
  };
}

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

  const port =
    safeParse("PORT", () => parseIntEnv("PORT", env.PORT, { min: 0 })) ??
    DEFAULTS.port;
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const sessionTtlMs =
    safeParse("SESSION_TTL_MS", () => parseIntEnv("SESSION_TTL_MS", env.SESSION_TTL_MS, { min: 1000 })) ??
    DEFAULTS.sessionTtlMs;
  const loginRateLimit = {
    windowMs:
      safeParse("LOGIN_RATE_LIMIT_WINDOW_MS", () =>
        parseIntEnv("LOGIN_RATE_LIMIT_WINDOW_MS", env.LOGIN_RATE_LIMIT_WINDOW_MS, {
          min: 1000,
        }),
      ) ?? DEFAULTS.loginRateLimit.windowMs,
    maxAttempts:
      safeParse("LOGIN_RATE_LIMIT_MAX_ATTEMPTS", () =>
        parseIntEnv("LOGIN_RATE_LIMIT_MAX_ATTEMPTS", env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS, {
          min: 1,
        }),
      ) ?? DEFAULTS.loginRateLimit.maxAttempts,
    blockDurationMs:
      safeParse("LOGIN_RATE_LIMIT_BLOCK_DURATION_MS", () =>
        parseIntEnv(
          "LOGIN_RATE_LIMIT_BLOCK_DURATION_MS",
          env.LOGIN_RATE_LIMIT_BLOCK_DURATION_MS,
          { min: 1000 },
        ),
      ) ?? DEFAULTS.loginRateLimit.blockDurationMs,
  };

  const cookieSecureOverride = parseBooleanEnv(env.COOKIE_SECURE);

  const defaults = validateDefaultCredentials(env, isProduction, errors);

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
      loginRateLimit,
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
