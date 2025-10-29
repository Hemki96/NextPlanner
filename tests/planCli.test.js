import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { JsonPlanStore } from "../server/stores/json-plan-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const cliPath = path.join(repoRoot, "server", "cli", "plan-cli.js");

function runCli(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: options.cwd ?? repoRoot,
      env: { ...process.env, NODE_ENV: "test" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

function createTempDir() {
  return mkdtempSync(path.join(tmpdir(), "nextplanner-cli-"));
}

describe("Plan CLI", () => {
  let tempDir;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("listet Pläne aus der JSON-Datenbank", async () => {
    tempDir = createTempDir();
    const storageFile = path.join(tempDir, "plans.json");
    const store = new JsonPlanStore({ storageFile });
    await store.createPlan({
      title: "Testplan",
      content: "Training",
      planDate: "2024-07-01",
      focus: "AR",
    });
    await store.close();

    const listResult = await runCli([
      `--storage-file=${storageFile}`,
      "list",
    ]);

    assert.equal(listResult.code, 0);
    assert.match(listResult.stdout, /Testplan/);
  });

  it("zeigt einen Plan im JSON-Format", async () => {
    tempDir = createTempDir();
    const storageFile = path.join(tempDir, "plans.json");
    const store = new JsonPlanStore({ storageFile });
    const plan = await store.createPlan({
      title: "Detailplan",
      content: "4x50m",
      planDate: "2024-08-01",
      focus: "AR",
    });
    await store.close();

    const showResult = await runCli([
      `--storage-file=${storageFile}`,
      "show",
      String(plan.id),
      "--json",
    ]);

    assert.equal(showResult.code, 0);
    const parsed = JSON.parse(showResult.stdout);
    assert.equal(parsed.title, "Detailplan");
  });

  it("validiert Pläne und meldet Fehler bei unbekannter ID", async () => {
    tempDir = createTempDir();
    const storageFile = path.join(tempDir, "plans.json");
    const store = new JsonPlanStore({ storageFile });
    const plan = await store.createPlan({
      title: "Validierung",
      content: "6x100m",
      planDate: "2024-09-01",
      focus: "AR",
    });
    await store.close();

    const validateSuccess = await runCli([
      `--storage-file=${storageFile}`,
      "validate",
      String(plan.id),
    ]);
    assert.equal(validateSuccess.code, 0);
    assert.match(validateSuccess.stdout, /gültig/);

    const validateFailure = await runCli([
      `--storage-file=${storageFile}`,
      "validate",
      "999",
    ]);
    assert.equal(validateFailure.code, 1);
    assert.match(validateFailure.stderr, /nicht gefunden/);
  });

  it("erstellt Backups und pruned alte Sicherungen", async () => {
    tempDir = createTempDir();
    const storageFile = path.join(tempDir, "plans.json");
    const store = new JsonPlanStore({ storageFile });
    await store.createPlan({
      title: "Backup",
      content: "Plan",
      planDate: "2024-10-01",
      focus: "AR",
    });
    await store.close();

    const backupResult = await runCli([
      `--storage-file=${storageFile}`,
      "backup",
      "--prune=1",
      "--json",
    ]);
    assert.equal(backupResult.code, 0);
    const payload = JSON.parse(backupResult.stdout);
    assert.equal(payload.planCount, 1);
    assert.equal(payload.pruned, 0);

    // Erstelle eine zweite Sicherung, damit die erste gepruned werden kann
    await runCli([
      `--storage-file=${storageFile}`,
      "backup",
      "--prune=1",
    ]);
    const backupDir = path.join(path.dirname(storageFile), "backups");
    const backups = readdirSync(backupDir).filter((file) => file.endsWith(".json"));
    assert.equal(backups.length, 1);
  });
});
