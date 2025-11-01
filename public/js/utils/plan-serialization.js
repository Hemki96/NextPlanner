const PLAN_EXPORT_FORMAT = "nextplanner/plan";
const PLAN_BACKUP_FORMAT = "nextplanner/plan-backup";
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

function markErrorWithSource(error, sourceLabel) {
  if (sourceLabel && !error.fileName) {
    error.fileName = sourceLabel;
  }
  return error;
}

function sanitizeOptionalText(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function buildPlanCandidate({
  content,
  title = null,
  planDate = null,
  focus = null,
  id = null,
  sourceLabel = null,
}) {
  return {
    content: sanitizePlanText(content),
    title: sanitizeOptionalText(title),
    planDate: sanitizeOptionalText(planDate),
    focus: sanitizeOptionalText(focus),
    id: typeof id === "number" && Number.isInteger(id) ? id : null,
    sourceLabel: sanitizeOptionalText(sourceLabel),
  };
}

function parseBackupPlan(plan, { sourceLabel } = {}) {
  if (!plan || typeof plan !== "object") {
    return null;
  }
  if (typeof plan.content !== "string") {
    return null;
  }
  return buildPlanCandidate({
    content: plan.content,
    title: plan.title,
    focus: plan.focus,
    planDate: plan.planDate,
    id: plan.id,
    sourceLabel,
  });
}

function parseLoosePlanObject(value, { sourceLabel } = {}) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (typeof value.content === "string") {
    return buildPlanCandidate({
      content: value.content,
      title: value.title,
      focus: value.focus,
      planDate: value.planDate,
      id: value.id,
      sourceLabel,
    });
  }

  if (
    value.data &&
    typeof value.data === "object" &&
    typeof value.data.content === "string"
  ) {
    return buildPlanCandidate({
      content: value.data.content,
      title: value.data.title,
      focus: value.data.focus,
      planDate: value.data.planDate,
      id: value.data.id,
      sourceLabel,
    });
  }

  return null;
}

function parsePlanCollection(parsed, options) {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  if (parsed.format === PLAN_BACKUP_FORMAT) {
    const plans = Array.isArray(parsed.data?.plans)
      ? parsed.data.plans
      : [];
    return {
      recognized: true,
      plans: plans
        .map((plan) => parseBackupPlan(plan, options))
        .filter(Boolean),
    };
  }

  if (Array.isArray(parsed.plans)) {
    return {
      recognized: true,
      plans: parsed.plans
        .map((plan) => parseLoosePlanObject(plan, options))
        .filter(Boolean),
    };
  }

  if (Array.isArray(parsed.data?.plans)) {
    return {
      recognized: true,
      plans: parsed.data.plans
        .map((plan) => parseLoosePlanObject(plan, options))
        .filter(Boolean),
    };
  }

  if (Array.isArray(parsed.data?.contents)) {
    return {
      recognized: true,
      plans: parsed.data.contents
        .filter((entry) => typeof entry === "string")
        .map((content) =>
          buildPlanCandidate({ content, sourceLabel: options?.sourceLabel })
        ),
    };
  }

  return null;
}

function parsePlanArray(parsed, options) {
  if (!Array.isArray(parsed)) {
    return null;
  }

  return {
    recognized: true,
    plans: parsed
      .map((entry) => {
        if (typeof entry === "string") {
          return buildPlanCandidate({
            content: entry,
            sourceLabel: options?.sourceLabel,
          });
        }
        if (entry && typeof entry === "object") {
          return parseLoosePlanObject(entry, options);
        }
        return null;
      })
      .filter(Boolean),
  };
}

function parseSinglePlan(parsed, options) {
  if (!parsed || typeof parsed !== "object") {
    if (typeof parsed === "string") {
      return buildPlanCandidate({
        content: parsed,
        sourceLabel: options?.sourceLabel,
      });
    }
    return null;
  }

  if (parsed.format === PLAN_EXPORT_FORMAT) {
    const content = parsed.data?.content;
    if (typeof content === "string") {
      return buildPlanCandidate({
        content,
        title: parsed.data?.title,
        focus: parsed.data?.focus,
        planDate: parsed.data?.planDate,
        id: parsed.data?.id,
        sourceLabel: options?.sourceLabel,
      });
    }
  }

  return parseLoosePlanObject(parsed, options);
}

export function parsePlanImportJson(raw, options = {}) {
  const { sourceLabel } = options;
  if (!raw || typeof raw !== "string") {
    throw markErrorWithSource(new Error("INVALID_JSON_CONTENT"), sourceLabel);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const wrapped = markErrorWithSource(new Error("JSON_PARSE_ERROR"), sourceLabel);
    wrapped.cause = error;
    throw wrapped;
  }

  const arrayResult = parsePlanArray(parsed, options);
  if (arrayResult) {
    if (arrayResult.plans.length === 0) {
      throw markErrorWithSource(new Error("NO_VALID_PLANS"), sourceLabel);
    }
    return arrayResult.plans;
  }

  const collectionResult = parsePlanCollection(parsed, options);
  if (collectionResult) {
    if (collectionResult.plans.length === 0) {
      throw markErrorWithSource(new Error("NO_VALID_PLANS"), sourceLabel);
    }
    return collectionResult.plans;
  }

  const singlePlan = parseSinglePlan(parsed, options);
  if (singlePlan) {
    return [singlePlan];
  }

  throw markErrorWithSource(new Error("UNSUPPORTED_PLAN_JSON"), sourceLabel);
}

export function describeJsonImportError(error) {
  if (!error) {
    return "Unbekannter Fehler beim Import der JSON-Datei.";
  }

  const fileHint = error.fileName ? ` „${error.fileName}“` : "";
  const jsonFileLabel = error.fileName ? `Die JSON-Datei${fileHint}` : "Die JSON-Datei";
  const genericFileLabel = error.fileName ? `Die Datei${fileHint}` : "Die Datei";
  const inFileClause = error.fileName ? ` in der Datei${fileHint}` : "";

  if (error.message === "JSON_PARSE_ERROR") {
    return `${jsonFileLabel} konnte nicht gelesen werden.`;
  }

  if (error.message === "UNSUPPORTED_PLAN_JSON") {
    return `Dieses JSON-Format${fileHint ? ` (${fileHint.trim()})` : ""} wird nicht unterstützt.`;
  }

  if (error.message === "NO_VALID_PLANS") {
    return `Es wurden${inFileClause} keine importierbaren Pläne gefunden.`;
  }

  if (error.message === "INVALID_JSON_CONTENT") {
    return `${genericFileLabel} enthält keine gültigen JSON-Daten.`;
  }

  return `${jsonFileLabel} konnte nicht importiert werden.`;
}

export { PLAN_EXPORT_FORMAT, PLAN_EXPORT_VERSION };
