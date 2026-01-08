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
  await page.getByLabel("Titel").fill("E2E-Testplan");
  await page.getByLabel("Datum").fill(isoDate);
  await page.getByLabel("Uhrzeit").fill("07:30");
  await page.getByLabel("Fokus").fill("Ausdauer");
  await page.getByLabel("Zusätzliche Notizen (optional)").fill("E2E-Notiz");
  await page.getByRole("button", { name: "Plan sichern" }).click();
  await expect(page.locator("#plan-save-status")).toContainText("Plan erfolgreich");
  await expect(page.locator("#plan-save-overlay")).toBeHidden();

  await page.goto(`${baseURL}/index.html`);
  await expect(page.locator("#calendar-selected-date")).toContainText(/\d{1,2}\.\s*\w+/);

  await expect(page.locator(`button.calendar-day.has-plans[data-date="${isoDate}"]`)).toBeVisible();
  await expect(page.locator(".plan-entry h3")).toContainText("E2E-Testplan");
});
