import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(CURRENT_DIR, "..");
const DEFAULT_DATA_DIR = path.join(PROJECT_ROOT, "data");
const SESSION_COOKIE_NAME = "nextplanner_session";

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

function validateDefaultCredentials(env, isProduction) {
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
      throw new Error(
        `Missing required credentials in production. Please set ${missing.join(", ")}.`
      );
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
  const port =
    parseIntEnv("PORT", env.PORT, { min: 0 }) ??
    DEFAULTS.port;
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const sessionTtlMs =
    parseIntEnv("SESSION_TTL_MS", env.SESSION_TTL_MS, { min: 1000 }) ??
    DEFAULTS.sessionTtlMs;
  const loginRateLimit = {
    windowMs:
      parseIntEnv("LOGIN_RATE_LIMIT_WINDOW_MS", env.LOGIN_RATE_LIMIT_WINDOW_MS, {
        min: 1000,
      }) ?? DEFAULTS.loginRateLimit.windowMs,
    maxAttempts:
      parseIntEnv("LOGIN_RATE_LIMIT_MAX_ATTEMPTS", env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS, {
        min: 1,
      }) ?? DEFAULTS.loginRateLimit.maxAttempts,
    blockDurationMs:
      parseIntEnv(
        "LOGIN_RATE_LIMIT_BLOCK_DURATION_MS",
        env.LOGIN_RATE_LIMIT_BLOCK_DURATION_MS,
        { min: 1000 },
      ) ?? DEFAULTS.loginRateLimit.blockDurationMs,
  };

  const cookieSecureOverride = parseBooleanEnv(env.COOKIE_SECURE);

  const defaults = validateDefaultCredentials(env, isProduction);

  const dataDir = resolveDataDir(env.NEXTPLANNER_DATA_DIR ?? env.DATA_DIR);

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
  };
}

const runtimeConfig = buildRuntimeConfig();

export { runtimeConfig, buildRuntimeConfig, PROJECT_ROOT, DEFAULT_DATA_DIR };
