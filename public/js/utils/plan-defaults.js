const DEFAULT_PLAN_SKELETON = [
  "## Einschwimmen",
  "",
  "## Hauptteil",
  "",
  "## Ausschwimmen",
  "",
].join("\n");

export function getDefaultPlanSkeleton() {
  return DEFAULT_PLAN_SKELETON;
}

export function ensurePlanSkeleton(textarea) {
  if (!textarea || typeof textarea.value !== "string") {
    return false;
  }

  if (textarea.value.trim().length > 0) {
    return false;
  }

  textarea.value = DEFAULT_PLAN_SKELETON;
  return true;
}
