import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PlannerController } from "../public/js/controllers/planner-controller.js";

describe("PlannerController", () => {
  it("aktualisiert Zustand und rendert bei Eingaben", async () => {
    const renderCalls = [];
    let savedDraft = "";
    let highlightedText = "";
    let refreshed = false;
    let validationIssues = null;
    const controller = new PlannerController({
      parsePlan: (text) => ({ content: text, issues: ["warn"] }),
      renderSummary: (plan) => {
        renderCalls.push(plan.content);
      },
      planService: {
        loadDraft: () => "",
        saveDraft: (text) => {
          savedDraft = text;
        },
        canUseApi: () => false,
      },
      views: {
        validationPanel: { update: (issues) => { validationIssues = issues; } },
        templateCapture: { update() {} },
        planSaveDialog: { update() {} },
        planHighlighter: {
          setText: (text) => {
            highlightedText = text;
          },
          refresh: () => {
            refreshed = true;
          },
        },
      },
      domRefs: {},
      featureFlags: {},
    });

    const textarea = { value: "" };
    controller.init({ textarea, initialText: "seed" });
    controller.handleInput("next");
    await new Promise((resolve) => setTimeout(resolve, 200));

    assert.equal(controller.state.text, "next");
    assert.equal(textarea.value, "next");
    assert.equal(savedDraft, "next");
    assert.equal(highlightedText, "next");
    assert.deepEqual(validationIssues, ["warn"]);
    assert.ok(renderCalls.includes("next"));
    assert.equal(refreshed, true);
  });

  it("lädt Pläne aus Query-Parametern", async () => {
    const fetchedPlan = { content: "geladener Plan", title: "Geladen" };
    const historyRef = {
      calls: [],
      replaceState(state, title, url) {
        this.calls.push({ state, title, url });
      },
    };
    const controller = new PlannerController({
      parsePlan: (text) => ({ content: text }),
      renderSummary: () => {},
      planService: {
        loadDraft: () => "",
        saveDraft: () => {},
        fetchPlan: async (id) => {
          assert.equal(id, "42");
          return fetchedPlan;
        },
        canUseApi: () => true,
      },
      views: {
        validationPanel: { update() {} },
        templateCapture: { update() {} },
        planSaveDialog: { update() {} },
        planHighlighter: { setText() {}, refresh() {} },
      },
      domRefs: {},
      featureFlags: {},
    });

    const textarea = { value: "" };
    controller.init({ textarea, initialText: "" });
    const params = new URLSearchParams({ planId: "42" });

    await controller.loadPlanFromQuery(params, {
      documentRef: { title: "Start", location: { pathname: "/index.html" } },
      historyRef,
    });

    assert.equal(controller.state.text, fetchedPlan.content);
    assert.equal(historyRef.calls.length, 1);
    assert.equal(historyRef.calls[0].url, "/index.html");
  });
});
