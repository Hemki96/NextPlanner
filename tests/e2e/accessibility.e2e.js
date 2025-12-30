import AxeBuilder from "@axe-core/playwright";

import { test, expect, login, credentials } from "./playwright-fixture.js";

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

test("meldet keine schwerwiegenden A11y-Verstöße auf Login, Kalender und Planner", async ({ page, server }) => {
  const { baseURL } = server;

  await page.goto(`${baseURL}/login.html`);
  await expectNoSeriousViolations(page, "Login");

  await login(page, baseURL, credentials.admin);
  await expect(page.getByText(/Angemeldet als/i)).toBeVisible();
  await expectNoSeriousViolations(page, "Kalender");

  await page.goto(`${baseURL}/planner.html`);
  await expectNoSeriousViolations(page, "Planner");
});
