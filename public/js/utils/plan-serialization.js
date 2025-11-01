const PLAN_EXPORT_FORMAT = "nextplanner/plan";
const PLAN_EXPORT_VERSION = 1;

function sanitizePlanText(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\r\n?/g, "\n");
}

export function createPlanExportJson(planText) {
  const payload = {
    format: PLAN_EXPORT_FORMAT,
    version: PLAN_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      content: sanitizePlanText(planText),
    },
  };
  return JSON.stringify(payload, null, 2);
}

export function parsePlanImportJson(raw) {
  if (!raw || typeof raw !== "string") {
    throw new Error("INVALID_JSON_CONTENT");
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const wrapped = new Error("JSON_PARSE_ERROR");
    wrapped.cause = error;
    throw wrapped;
  }

  if (parsed && typeof parsed === "object") {
    if (
      parsed.format === PLAN_EXPORT_FORMAT &&
      parsed.version &&
      parsed.data &&
      typeof parsed.data.content === "string"
    ) {
      return sanitizePlanText(parsed.data.content);
    }

    if (typeof parsed.content === "string" && !parsed.format && !parsed.version) {
      return sanitizePlanText(parsed.content);
    }
  }

  throw new Error("UNSUPPORTED_PLAN_JSON");
}

export function describeJsonImportError(error) {
  if (!error) {
    return "Unbekannter Fehler beim Import der JSON-Datei.";
  }

  if (error.message === "JSON_PARSE_ERROR") {
    return "Die JSON-Datei konnte nicht gelesen werden.";
  }

  if (error.message === "UNSUPPORTED_PLAN_JSON") {
    return "Dieses JSON-Format wird nicht unterstützt.";
  }

  return "Die JSON-Datei konnte nicht importiert werden.";
}

export { PLAN_EXPORT_FORMAT, PLAN_EXPORT_VERSION };
