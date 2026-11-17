import AxeBuilder from "@axe-core/playwright";

import { test, expect } from "./playwright-fixture.js";

async function expectNoSeriousViolations(page, context = "Seite") {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );

  if (serious.length > 0) {
    console.error(`${context}:`, JSON.stringify(serious, null, 2));
  }

  expect(serious, `${context} enthält schwerwiegende Barrierefreiheitsfehler`).toEqual([]);
}

test.describe.configure({ mode: "serial" });

test("meldet keine schwerwiegenden A11y-Verstöße auf Kalender und Planner", async ({ page, server }) => {
  const { baseURL } = server;

  await page.goto(`${baseURL}/index.html`);
  await expectNoSeriousViolations(page, "Kalender");

  await page.goto(`${baseURL}/planner.html`);
  await expectNoSeriousViolations(page, "Planner");
});

test("Fokus bleibt im Speicherdialog und kehrt beim Schließen zurück", async ({ page, server }) => {
  await page.goto(`${server.baseURL}/planner.html`);
  await expect(page.locator("#help-overlay")).toBeHidden();

  const opener = page.getByRole("button", { name: "Plan speichern" });
  await opener.click();
  await expect(page.locator("#plan-save-title")).toBeFocused();

  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
    const insideDialog = await page.evaluate(() => {
      const dialog = document.querySelector("#plan-save-overlay");
      return dialog instanceof HTMLElement && dialog.contains(document.activeElement);
    });
    expect(insideDialog).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
});

test("die Auswertung hat eine kurze Live-Region und respektiert reduzierte Bewegung", async ({ page, server }) => {
  await page.goto(`${server.baseURL}/planner.html`);

  await expect(page.locator(".summary-panel")).not.toHaveAttribute("aria-live", /.*/);
  await expect(page.locator("#summary-status")).toHaveAttribute("aria-live", "polite");

  await page.emulateMedia({ reducedMotion: "reduce" });
  const transitionDuration = await page.locator(".template-overlay").first().evaluate(
    (element) => window.getComputedStyle(element).transitionDuration,
  );
  expect(transitionDuration).not.toContain("0.25s");
});
