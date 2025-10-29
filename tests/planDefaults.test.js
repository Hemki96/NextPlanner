import test from "node:test";
import assert from "node:assert/strict";

const { getDefaultPlanSkeleton, ensurePlanSkeleton } = await import(
  "../public/js/utils/plan-defaults.js"
);

test("default skeleton lists Einschwimmen, Hauptteil und Ausschwimmen", () => {
  const skeleton = getDefaultPlanSkeleton();
  const sections = skeleton
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  assert.deepEqual(sections, ["## Einschwimmen", "## Hauptteil", "## Ausschwimmen"]);
});

test("ensurePlanSkeleton fills empty textarea", () => {
  const textarea = { value: "" };
  const applied = ensurePlanSkeleton(textarea);

  assert.equal(applied, true);
  assert.equal(textarea.value, getDefaultPlanSkeleton());
});

test("ensurePlanSkeleton respects existing content", () => {
  const textarea = { value: "## Eigener Block" };
  const applied = ensurePlanSkeleton(textarea);

  assert.equal(applied, false);
  assert.equal(textarea.value, "## Eigener Block");
});

test("ensurePlanSkeleton tolerates missing textarea", () => {
  assert.equal(ensurePlanSkeleton(null), false);
});

