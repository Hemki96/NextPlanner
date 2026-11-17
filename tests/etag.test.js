import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildHighlightConfigEtag,
  buildPlanEtag,
  buildTemplateEtag,
  etagMatches,
  parseEtagList,
} from "../server/http/etag.js";

const plan = {
  id: 1,
  title: "Plan",
  content: "4x50m",
  planDate: "2024-01-01",
  focus: "AR",
  metadata: {},
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  createdByUserId: null,
  updatedByUserId: null,
};

describe("ETag-Strategie", () => {
  it("liefert für alle Ressourcen kanonische ETags aus dem gemeinsamen Helper", () => {
    const planEtag = buildPlanEtag(plan);
    assert.match(planEtag, /^"[a-f0-9]{64}"$/);
    assert.equal(planEtag, buildPlanEtag({ ...plan, metadata: {} }));
    assert.notEqual(planEtag, buildPlanEtag({ ...plan, content: "8x50m" }));

    const templateEtag = buildTemplateEtag({
      id: "abc",
      type: "Set",
      title: "Titel",
      notes: "",
      content: "4x50m",
      tags: ["a"],
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    assert.match(templateEtag, /^"[a-f0-9]{64}"$/);

    const configEtag = buildHighlightConfigEtag({
      intensities: ["EN1"],
      equipment: ["Board"],
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    assert.match(configEtag, /^"[a-f0-9]{64}"$/);
  });

  it("verwendet für If-None-Match den schwachen, für If-Match den starken Vergleich", () => {
    const etag = buildPlanEtag(plan);
    assert.equal(etagMatches(etag, etag), true);
    assert.equal(etagMatches(`W/${etag}`, etag), true);
    assert.equal(etagMatches(`W/${etag}`, etag, { strong: true }), false);
    assert.equal(etagMatches('"anderer"', etag), false);
  });

  it("behandelt '*' je nach Präcondition korrekt", () => {
    const etag = buildPlanEtag(plan);
    assert.equal(etagMatches("*", etag, { strong: true }), true);
    assert.equal(etagMatches("*", etag), false);
  });

  it("zerlegt ETag-Listen auch mit Kommata in Anführungszeichen", () => {
    assert.deepEqual(parseEtagList('"a,b", "c"'), ['"a,b"', '"c"']);
  });
});
