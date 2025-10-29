import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const cliPath = path.join(repoRoot, "js", "storage", "planCli.js");

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

  it("fügt Pläne hinzu und listet sie", async () => {
    tempDir = createTempDir();
    const storageFile = path.join(tempDir, "plans.json");

    const addResult = await runCli([
      `--storage-file=${storageFile}`,
      "add",
      "--title=Testplan",
      "--date=2024-07-01",
      "--focus=AR",
      "--content=Training",
    ]);

    assert.equal(addResult.code, 0);

    const listResult = await runCli([
      `--storage-file=${storageFile}`,
      "list",
    ]);

    assert.equal(listResult.code, 0);
    assert.match(listResult.stdout, /Testplan/);
  });

  it("liefert Validierungsfehler für ungültige Metadaten", async () => {
    tempDir = createTempDir();
    const storageFile = path.join(tempDir, "plans.json");

    const result = await runCli([
      `--storage-file=${storageFile}`,
      "add",
      "--title=Fehler",
      "--date=2024-07-01",
      "--focus=AR",
      "--content=Test",
      "--metadata={invalid}",
    ]);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /Metadaten konnten nicht gelesen werden/);
  });

  it("meldet Sicherungsdatei bei korruptem Speicher", async () => {
    tempDir = createTempDir();
    const storageFile = path.join(tempDir, "plans.json");
    writeFileSync(storageFile, "{ invalid json", "utf8");

    const result = await runCli([
      `--storage-file=${storageFile}`,
      "list",
    ]);

    assert.equal(result.code, 2);
    assert.match(result.stderr, /Backup:/);
  });
});
