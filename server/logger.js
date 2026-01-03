// Kleines Logging-Modul ohne externe Abhängigkeiten. Es bietet konsistente
// Ausgaben mit Zeitstempel und unterstützt verschiedene Loglevel, die über die
// Umgebungsvariable LOG_LEVEL konfiguriert werden können.
import util from "node:util";

const LEVELS = Object.freeze({
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
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

// Gibt eine Nachricht aus, falls das Level erlaubt ist.
function emit(level, stream, message, args) {
  if (!shouldLog(level)) {
    return;
  }
  const formatted = formatMessage(level, message, args);
  stream(formatted);
}

export const logger = Object.freeze({
  error(message, ...args) {
    emit("error", console.error, message, args);
  },
  warn(message, ...args) {
    emit("warn", console.warn, message, args);
  },
  info(message, ...args) {
    emit("info", console.log, message, args);
  },
  debug(message, ...args) {
    emit("debug", console.debug ?? console.log, message, args);
  },
});

/**
 * Erzeugt einen Logger, der alle Ausgaben mit einem Kontext-Präfix versieht
 * (z. B. `req=12`). So lassen sich zusammengehörige Logzeilen später leichter
 * im Logfile finden.
 *
 * @param {Record<string, string|number>} [context] Schlüssel/Wert-Paare, die dem Log vorangestellt werden.
 * @returns {{error: Function, warn: Function, info: Function, debug: Function}} Objekt mit Logging-Methoden.
 */
export function createRequestLogger(context = {}) {
  const base = Object.entries(context)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  const prefix = base ? `${base} ` : "";
  return {
    error(message, ...args) {
      logger.error(`${prefix}${message}`, ...args);
    },
    warn(message, ...args) {
      logger.warn(`${prefix}${message}`, ...args);
    },
    info(message, ...args) {
      logger.info(`${prefix}${message}`, ...args);
    },
    debug(message, ...args) {
      logger.debug(`${prefix}${message}`, ...args);
    },
  };
}
