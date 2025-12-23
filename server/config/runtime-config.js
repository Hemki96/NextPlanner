import path from "node:path";
import { fileURLToPath } from "node:url";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(CURRENT_DIR, "..");
const DEFAULT_DATA_DIR = path.join(PROJECT_ROOT, "data");
const DEFAULT_ALLOWED_ORIGINS = Object.freeze(["http://localhost:3000"]);
const DEFAULT_DEV_CREDENTIALS = Object.freeze({
  admin: { username: "admin", password: "Admin1234!" },
  editor: { username: "coach", password: "CoachPower#2024" },
  user: { username: "athlete", password: "AthleteReady#2024" },
});

function resolveDataDirectory(value) {
  if (!value) {
    return DEFAULT_DATA_DIR;
  }
  if (path.isAbsolute(value)) {
    return value;
  }
  return path.resolve(PROJECT_ROOT, value);
}

function parseAllowedOrigins(value) {
  if (!value) {
    return [...DEFAULT_ALLOWED_ORIGINS];
  }
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function parseBooleanFlag(value) {
  const normalized = value?.toString().trim().toLowerCase();
  if (normalized === undefined || normalized === "") {
    return null;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function buildErrorMessage(errors) {
  const lines = errors.map(
    (error, index) =>
      `${index + 1}. ${error.message}${error.hint ? `\n   Hinweis: ${error.hint}` : ""}`,
  );
  return `Ungültige Laufzeit-Konfiguration (${errors.length} Fehler):\n${lines.join("\n")}`;
}

export class RuntimeConfigError extends Error {
  constructor(errors) {
    super(buildErrorMessage(errors));
    this.name = "RuntimeConfigError";
    this.errors = errors;
  }
}

export function buildRuntimeConfig(env = process.env) {
  const errors = [];
  const nodeEnv = (env.NODE_ENV ?? "development").trim() || "development";
  const isProduction = nodeEnv === "production";
  const dataDir = resolveDataDirectory(env.NEXTPLANNER_DATA_DIR ?? env.DATA_DIR);
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);

  const parsedSecureFlag = parseBooleanFlag(env.COOKIE_SECURE);
  if (parsedSecureFlag === undefined) {
    errors.push({
      message: "COOKIE_SECURE muss 'true' oder 'false' sein, wenn gesetzt.",
      hint: "Entferne die Variable für automatisches Verhalten oder setze sie auf 'true'/'false'.",
    });
  }
  const secureCookies = parsedSecureFlag ?? (isProduction ? true : null);

  let port = 3000;
  if (env.PORT !== undefined) {
    const parsedPort = Number(env.PORT);
    if (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65535) {
      errors.push({
        message: "PORT muss eine Ganzzahl zwischen 0 und 65535 sein.",
        hint: "Beispiel: PORT=4000 oder PORT=0 für automatische Portwahl.",
      });
    } else {
      port = parsedPort;
    }
  }

  function resolveCredentialPair(role) {
    const [userVar, passwordVar] = credentialEnvKeys[role] ?? [];
    const defaultPair = DEFAULT_DEV_CREDENTIALS[role];
    const username = env[userVar];
    const password = env[passwordVar];
    if (isProduction && (!username || !password)) {
      errors.push({
        message: `Seed-Credentials für ${role} fehlen (${userVar}/${passwordVar}).`,
        hint: "Setze eindeutige Zugangsdaten pro Rolle, um Default-Logins in Produktion zu vermeiden.",
      });
    }
    return {
      username: username ?? defaultPair.username,
      password: password ?? defaultPair.password,
    };
  }

  const credentialEnvKeys = {
    admin: ["NEXTPLANNER_ADMIN_USER", "NEXTPLANNER_ADMIN_PASSWORD"],
    editor: ["NEXTPLANNER_EDITOR_USER", "NEXTPLANNER_EDITOR_PASSWORD"],
    user: ["NEXTPLANNER_USER", "NEXTPLANNER_USER_PASSWORD"],
  };

  const credentials = {
    admin: resolveCredentialPair("admin"),
    editor: resolveCredentialPair("editor"),
    user: resolveCredentialPair("user"),
  };

  if (errors.length > 0) {
    throw new RuntimeConfigError(errors);
  }

  return {
    nodeEnv,
    isProduction,
    dataDir,
    allowedOrigins,
    credentials,
    secureCookies,
    port,
  };
}

export {
  DEFAULT_ALLOWED_ORIGINS,
  DEFAULT_DATA_DIR,
  DEFAULT_DEV_CREDENTIALS,
  PROJECT_ROOT,
  resolveDataDirectory,
};
