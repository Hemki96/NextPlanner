// Kleines Logging-Modul ohne externe Abhängigkeiten. Es bietet konsistente
// Ausgaben mit Zeitstempel und unterstützt verschiedene Loglevel, die über die
// Umgebungsvariable LOG_LEVEL konfiguriert werden können.
import util from "node:util";

const RUNTIME_CONTEXT = Object.freeze({
  app: "nextplanner",
  env: process.env.NODE_ENV ?? "development",
});

const LEVELS = Object.freeze({
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
});

const DEFAULT_LEVEL = (() => {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && Object.hasOwn(LEVELS, envLevel)) {
    return envLevel;
  }
  // In der Entwicklung ist Debug-Logging aktiv, sonst Info.
  return process.env.NODE_ENV === "development" ? "debug" : "info";
})();

const activeLevel = LEVELS[DEFAULT_LEVEL] ?? LEVELS.info;

// Prüft, ob Nachrichten des gewünschten Levels ausgegeben werden sollen.
function shouldLog(level) {
  const numeric = LEVELS[level];
  if (numeric === undefined) {
    return false;
  }
  return numeric <= activeLevel;
}

// Formatiert eine Logzeile mit Zeitstempel und Level.
function formatMessage(level, message, args) {
  const formatted = args.length > 0 ? util.format(message, ...args) : message;
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] ${formatted}`;
}

function formatContext(context = {}) {
  const entries = Object.entries(context).filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (entries.length === 0) {
    return "";
  }
  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
}

// Gibt eine Nachricht aus, falls das Level erlaubt ist.
function emit(level, stream, message, args) {
  if (!shouldLog(level)) {
    return;
  }
  const formatted = formatMessage(level, message, args);
  stream(formatted);
}

function buildLogger(baseContext = {}) {
  const mergedContext = { ...RUNTIME_CONTEXT, ...baseContext };
  const prefix = formatContext(mergedContext);
  const decorate = (message) => (prefix ? `${prefix} ${message}` : message);

  return Object.freeze({
    error(message, ...args) {
      emit("error", console.error, decorate(message), args);
    },
    warn(message, ...args) {
      emit("warn", console.warn, decorate(message), args);
    },
    info(message, ...args) {
      emit("info", console.log, decorate(message), args);
    },
    debug(message, ...args) {
      emit("debug", console.debug ?? console.log, decorate(message), args);
    },
    trace(message, ...args) {
      emit("trace", console.debug ?? console.log, decorate(message), args);
    },
    withContext(extraContext = {}) {
      return buildLogger({ ...mergedContext, ...extraContext });
    },
    child(extraContext = {}) {
      return buildLogger({ ...mergedContext, ...extraContext });
    },
  });
}

export const logger = buildLogger();

/**
 * Erzeugt einen Logger, der alle Ausgaben mit einem Kontext-Präfix versieht
 * (z. B. `reqId=12 method=GET`). So lassen sich zusammengehörige Logzeilen
 * später leichter im Logfile finden.
 *
 * @param {Record<string, string|number>} [context] Schlüssel/Wert-Paare, die dem Log vorangestellt werden.
   * @returns {{error: Function, warn: Function, info: Function, debug: Function, trace: Function}} Objekt mit Logging-Methoden.
 */
export function createRequestLogger(context = {}, baseLogger = logger) {
  const scoped = baseLogger.child(context);
  return Object.freeze({
    error: scoped.error,
    warn: scoped.warn,
    info: scoped.info,
    debug: scoped.debug,
    trace: scoped.trace,
    child(extra = {}) {
      return createRequestLogger(extra, scoped);
    },
  });
}
