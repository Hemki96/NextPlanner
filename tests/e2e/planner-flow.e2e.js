import { test, expect } from "./playwright-fixture.js";

test.describe.configure({ mode: "serial" });

test("speichert einen Plan und zeigt ihn im Kalender an", async ({ page, server }) => {
  const { baseURL } = server;
  const today = new Date();
  const isoDate = today.toISOString().slice(0, 10);

  await page.goto(`${baseURL}/planner.html?planDate=${isoDate}`);

  const planText = ["## Warm-up", "2x50m locker @1:00", "P:00:20"].join("\n");
  await page.locator("#plan-input").fill(planText);
  await expect(page.locator("#total-distance")).toContainText("100");

  await page.getByRole("button", { name: "Plan speichern" }).click();
  const dialog = page.getByRole("dialog", { name: "Plan speichern" });
  await dialog.getByLabel("Titel").fill("E2E-Testplan");
  await dialog.getByLabel("Datum").fill(isoDate);
  await dialog.getByLabel("Uhrzeit").fill("07:30");
  await dialog.getByLabel("Fokus").fill("Ausdauer");
  await dialog.getByLabel("Zusätzliche Notizen (optional)").fill("E2E-Notiz");
  await page.getByRole("button", { name: "Plan sichern" }).click();
  await expect(page.locator("#plan-save-status")).toContainText("Plan erfolgreich");
  await expect(page.locator("#plan-save-overlay")).toBeHidden();

  await page.goto(`${baseURL}/index.html`);
  await expect(page.locator("#calendar-selected-date")).toContainText(/\d{1,2}\.\s*\w+/);

  await expect(page.locator(`button.calendar-day.has-plans[data-date="${isoDate}"]`)).toBeVisible();
  await expect(page.locator(".plan-entry h3")).toContainText("E2E-Testplan");
});

test("Material wird als Text gerendert und erzeugt keine Elemente", async ({ page, server }) => {
  await page.goto(`${server.baseURL}/planner.html`);

  await page.locator("#plan-input").fill("8x100m w/<img src=x onerror=alert(1)>");

  await expect(page.locator("#equipment-list")).toContainText("<img src=x onerror=alert(1)>");
  assertEqual(await page.locator("#equipment-list img").count(), 0);
});

function assertEqual(actual, expected) {
  if (actual !== expected) {
    throw new Error(`Erwartet ${expected}, erhalten ${actual}`);
  }
}

test("mehrfaches Absenden erzeugt nur einen Plan", async ({ page, server }) => {
  let postCount = 0;
  await page.route("**/api/plans", async (route) => {
    if (route.request().method() === "POST") {
      postCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    await route.continue();
  });

  const today = new Date();
  const isoDate = today.toISOString().slice(0, 10);
  await page.goto(`${server.baseURL}/planner.html?planDate=${isoDate}`);
  await page.locator("#plan-input").fill("4x50m locker");
  await page.getByRole("button", { name: "Plan speichern" }).click();
  const dialog = page.getByRole("dialog", { name: "Plan speichern" });
  await dialog.getByLabel("Titel").fill("Doppel-Test");
  await dialog.getByLabel("Datum").fill(isoDate);
  await dialog.getByLabel("Uhrzeit").fill("07:30");
  await dialog.getByLabel("Fokus").fill("Ausdauer");

  await page.evaluate(() => {
    const form = document.getElementById("plan-save-form");
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect(page.locator("#plan-save-overlay")).toBeHidden();
  expect(postCount).toBe(1);

  await page.goto(`${server.baseURL}/index.html`);
  const entries = page.locator(".plan-entry h3").filter({ hasText: "Doppel-Test" });
  await expect(entries).toHaveCount(1);
});

test("Navigation und Syntax-Hilfe bleiben bei deaktivierten Features erreichbar", async ({ page, server }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "nextplanner.featureSettings.v1",
      JSON.stringify({ quickSnippets: false, plannerTools: false }),
    );
  });
  await page.goto(`${server.baseURL}/planner.html`);

  await expect(page.getByRole("link", { name: "Einstellungen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hinweise & Syntax" })).toBeVisible();
});
