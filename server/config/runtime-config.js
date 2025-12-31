// Diese Datei fasst alle Regeln zusammen, mit denen die Anwendung ihre
// Laufzeitkonfiguration aus Umgebungsvariablen und sinnvollen Standards
// ableitet. Alle Schritte sind ausführlich dokumentiert, damit auch
// Einsteiger:innen verstehen, warum bestimmte Entscheidungen getroffen werden.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// Basispfade: Wir leiten den Projektstamm aus dem aktuellen Speicherort ab.
// Dadurch bleibt der Code robust, selbst wenn das Repository an einem anderen
// Ort ausgecheckt wird.
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

// Konstanten, die immer gleich bleiben und den Sicherheits- bzw. UX-Rahmen
// vorgeben. Durch Object.freeze werden versehentliche Änderungen verhindert.
const DEFAULT_ALLOWED_ORIGINS = Object.freeze(["http://localhost:3000"]);
const DEFAULT_ENVIRONMENT = "poet";
const DEV_ENVIRONMENT = "dev";
const DEV_ENV_DEFAULT_PASSWORD = "DevPass123!";
const DEFAULT_USERS_DISABLED_FLAGS = ["NEXTPLANNER_DISABLE_DEFAULT_USERS", "DISABLE_DEFAULT_USERS"];

const DEFAULTS = Object.freeze({
  // Standard-Port, falls kein anderer Wert gesetzt ist.
  port: 3000,
  // Lebensdauer einer Session in Millisekunden (12 Stunden).
  sessionTtlMs: 1000 * 60 * 60 * 12,
  // Rate-Limit für Login-Versuche, um Brute-Force-Angriffe einzudämmen.
  loginRateLimit: {
    windowMs: 1000 * 60 * 5,
    maxAttempts: 5,
    blockDurationMs: 1000 * 60 * 5,
  },
});

// Ermittelt, ob wir in einer produktionsähnlichen oder Entwicklungsumgebung
// laufen. Mehrere Variablennamen werden unterstützt, damit die Anwendung in
// unterschiedlichen Deployments flexibel konfiguriert werden kann.
function resolveEnvironment(env) {
  const raw =
    env.NEXTPLANNER_ENV ??
    env.NEXTPLANNER_ENVIRONMENT ??
    env.NEXTPLANNER_PROFILE ??
    env.APP_ENV ??
    env.APP_ENVIRONMENT ??
    env.RUNTIME_ENVIRONMENT ??
    DEFAULT_ENVIRONMENT;

  const normalized = String(raw ?? "").trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_ENVIRONMENT;
  }
  if (normalized === DEV_ENVIRONMENT || normalized === "development") {
    return DEV_ENVIRONMENT;
  }
  if (normalized === DEFAULT_ENVIRONMENT || normalized === "production") {
    return DEFAULT_ENVIRONMENT;
  }
  throw new Error("NEXTPLANNER_ENV muss 'dev' oder 'poet' sein.");
}

// Wandelt eine Umgebungsvariable in eine Zahl um und validiert sie. So
// verhindern wir, dass fehlerhafte Eingaben unbemerkt in die Konfiguration
// gelangen.
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

// Konvertiert Textwerte wie "true" oder "false" in echte Booleans. Andere
// Eingaben bleiben bewusst unverändert (null), damit sie später leicht erkannt
// werden können.
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
  // Gibt eine Liste erlaubter Ursprünge (CORS) zurück. Leere Eingaben führen zu
  // den Standardwerten für lokale Nutzung.
  if (!value) {
    return DEFAULT_ALLOWED_ORIGINS;
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveDataDir(value) {
  // Wandelt einen optionalen Pfad für den Datenordner in einen absoluten Pfad
  // um. Dadurch spielt das aktuelle Arbeitsverzeichnis keine Rolle und der
  // Datenpfad ist eindeutig.
  if (!value) {
    return DEFAULT_DATA_DIR;
  }
  if (path.isAbsolute(value)) {
    return value;
  }
  return path.resolve(PROJECT_ROOT, value);
}

function isPermissionError(error) {
  // Prüft gezielt, ob ein Fehler auf fehlende Dateiberechtigungen hinweist.
  return error?.code === "EACCES" || error?.code === "EPERM";
}

function ensureWritableDataDir(requestedDir, fallbackDir, warnings, errors) {
  // Stellt sicher, dass der gewünschte Datenordner existiert und beschreibbar
  // ist. Scheitert dies, versuchen wir einen Fallback und sammeln Warnungen,
  // damit Administrator:innen die Konfiguration nachziehen können.
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

function validateDefaultCredentials(env, { isProduction, devEnvironment }, errors) {
  // Liest Standard-Zugangsdaten aus der Umgebung oder nutzt nachvollziehbare
  // Default-Passwörter. In Produktion erzwingen wir, dass sichere Passwörter
  // gesetzt wurden, um ungeschützte Konten zu vermeiden.
  const adminUser = env.NEXTPLANNER_ADMIN_USER ?? env.ADMIN_USER ?? "admin";
  const adminPassword =
    env.NEXTPLANNER_ADMIN_PASSWORD ??
    env.ADMIN_PASSWORD ??
    (devEnvironment ? DEV_ENV_DEFAULT_PASSWORD : isProduction ? "" : "Admin1234!");
  const editorUser = env.NEXTPLANNER_EDITOR_USER ?? "coach";
  const editorPassword =
    env.NEXTPLANNER_EDITOR_PASSWORD ?? (devEnvironment ? DEV_ENV_DEFAULT_PASSWORD : isProduction ? "" : "CoachPower#2024");
  const userUser = env.NEXTPLANNER_USER ?? "athlete";
  const userPassword =
    env.NEXTPLANNER_USER_PASSWORD ??
    (devEnvironment ? DEV_ENV_DEFAULT_PASSWORD : isProduction ? "" : "AthleteReady#2024");

  if (isProduction && !devEnvironment) {
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
  // Kernfunktion: Sie sammelt alle Eingaben, validiert sie und erzeugt ein
  // strukturiertes Konfigurationsobjekt, das der Rest des Servers nutzt.
  const nodeEnv = env.NODE_ENV ?? "development";
  const isProduction = nodeEnv === "production";
  const isDevelopment = nodeEnv === "development";
  const environment = resolveEnvironment(env);
  const devEnvironment = environment === DEV_ENVIRONMENT;
  const disableDefaultUsers = DEFAULT_USERS_DISABLED_FLAGS.some(
    (flag) => parseBooleanEnv(env[flag]) === true,
  );
  const errors = [];
  const warnings = [];
  const safeParse = (label, fn) => {
    // Hilfsfunktion, um Fehlermeldungen zu sammeln, ohne den gesamten Vorgang
    // zu unterbrechen. So können wir alle Probleme auf einmal melden.
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

  const defaults = disableDefaultUsers
    ? {}
    : validateDefaultCredentials(env, { isProduction, devEnvironment }, errors);

  const resolvedDataDir = resolveDataDir(env.NEXTPLANNER_DATA_DIR ?? env.DATA_DIR);
  const dataDir = ensureWritableDataDir(resolvedDataDir, DEFAULT_DATA_DIR, warnings, errors);

  if (errors.length > 0) {
    // Alle gesammelten Fehler werden gebündelt gemeldet, damit Nutzer:innen
    // sofort sehen, welche Einstellungen angepasst werden müssen.
    const unique = Array.from(new Set(errors));
    throw new RuntimeConfigError(`Invalid runtime config:\n- ${unique.join("\n- ")}`);
  }

  // Endergebnis: ein Konfigurationsobjekt mit klar getrennten Bereichen. Die
  // Warnungen werden eingefroren, damit sie nicht versehentlich verändert
  // werden.
  return {
    env: {
      nodeEnv,
      isProduction,
      isDevelopment,
      environment,
      devEnvironment,
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
      devAuth: {
        enabled: devEnvironment && !disableDefaultUsers,
        environment,
        defaultPassword: devEnvironment && !disableDefaultUsers ? DEV_ENV_DEFAULT_PASSWORD : null,
        users: Object.values(defaults).map((user) => ({
          username: user.username,
          roles: user.roles ?? [],
          isAdmin: user.roles?.includes("admin"),
        })),
      },
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
