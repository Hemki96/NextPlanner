import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { promises as fsPromises } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, mock } from "node:test";

import { JsonUserStore } from "../server/stores/json-user-store.js";
import { JsonSnippetStore } from "../server/stores/json-snippet-store.js";
import { JsonHighlightConfigStore } from "../server/stores/json-highlight-config-store.js";
import { writeJsonFileAtomically } from "../server/stores/atomic-json-file.js";
import { sanitizeQuickSnippetGroups } from "../public/js/utils/snippet-storage.js";

async function withTempDir(prefix, fn) {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function assertCorruptionHandled(dir, storageFile, store, rawContent) {
  await writeFile(storageFile, rawContent, "utf8");
  const reopened = store();
  await reopened.checkHealth().then(
    () => assert.fail("Health-Check sollte degraded melden"),
    (error) => assert.match(String(error.message), /isoliert/),
  );

  const files = await readdir(dir);
  const backup = files.find((name) => name.includes(".corrupt-"));
  assert.ok(backup, "beschädigte Datei wurde isoliert");
  assert.equal(await readFile(path.join(dir, backup), "utf8"), rawContent);
  await reopened.close();
}

describe("Store-Integrität", () => {
  it("isoliert eine beschädigte User-Datei statt sie zu überschreiben", async () => {
    await withTempDir("nextplanner-user-corrupt-", async (dir) => {
      const storageFile = path.join(dir, "users.json");
      await assertCorruptionHandled(
        dir,
        storageFile,
        () => new JsonUserStore({ storageFile }),
        "{ keingültiges json",
      );
    });
  });

  it("isoliert eine beschädigte Snippet-Datei statt sie zu überschreiben", async () => {
    await withTempDir("nextplanner-snippet-corrupt-", async (dir) => {
      const storageFile = path.join(dir, "team-snippets.json");
      await assertCorruptionHandled(
        dir,
        storageFile,
        () => new JsonSnippetStore({ storageFile }),
        "{ keingültiges json",
      );
    });
  });

  it("isoliert eine beschädigte Highlight-Konfiguration statt sie zu überschreiben", async () => {
    await withTempDir("nextplanner-highlight-corrupt-", async (dir) => {
      const storageFile = path.join(dir, "highlight-config.json");
      await assertCorruptionHandled(
        dir,
        storageFile,
        () => new JsonHighlightConfigStore({ storageFile }),
        "{ keingültiges json",
      );
    });
  });

  it("behält den alten Speicherstand, wenn ein Write fehlschlägt", async () => {
    await withTempDir("nextplanner-write-failure-", async (dir) => {
      const storageFile = path.join(dir, "team-snippets.json");
      const store = new JsonSnippetStore({ storageFile });
      const original = await store.getLibrary();
      const originalGroups = original.groups;

      const originalOpen = fsPromises.open;
      const openMock = mock.method(fsPromises, "open", async (...args) => {
        if (String(args[0]).endsWith(".tmp")) {
          const error = new Error("Simulierter Write-Fehler");
          error.code = "EACCES";
          throw error;
        }
        return originalOpen(...args);
      });

      try {
        await assert.rejects(
          store.replaceLibrary([
            {
              title: "Neue Gruppe",
              description: "",
              items: [{ label: "Test", snippet: "4x50m" }],
            },
          ]),
        );
      } finally {
        openMock.mock.restore();
      }

      const current = await store.getLibrary();
      assert.deepEqual(current.groups, originalGroups);
      assert.deepEqual(
        current.groups,
        sanitizeQuickSnippetGroups(originalGroups),
      );
      await store.close();
    });
  });

  it("sperrt Schreibvorgänge über Prozessgrenzen hinweg", async () => {
    await withTempDir("nextplanner-cross-process-", async (dir) => {
      const storageFile = path.join(dir, "plans.json");
      const helperPath = path.resolve("server/stores/atomic-json-file.js");
      const childCode = `
        import { withFileLock } from ${JSON.stringify(helperPath)};
        await withFileLock(${JSON.stringify(storageFile)}, async () => {
          process.stdout.write("locked\\n");
          await new Promise((resolve) => setTimeout(resolve, 350));
        });
      `;
      const child = spawn(process.execPath, ["--input-type=module", "-e", childCode]);
      await new Promise((resolve, reject) => {
        child.stdout.on("data", (chunk) => {
          if (String(chunk).includes("locked")) resolve();
        });
        child.on("error", reject);
      });

      const startedAt = Date.now();
      await writeJsonFileAtomically(storageFile, { value: 2 });
      const elapsed = Date.now() - startedAt;
      assert.ok(elapsed >= 150, "Schreiben wartet auf die Sperre des anderen Prozesses");
      if (child.exitCode === null) {
        await new Promise((resolve) => child.once("close", resolve));
      }
      assert.deepEqual(JSON.parse(await readFile(storageFile, "utf8")), { value: 2 });
    });
  });
});
