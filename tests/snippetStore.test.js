import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, beforeEach, afterEach } from "node:test";

import { JsonSnippetStore } from "../server/stores/json-snippet-store.js";
import { sanitizeQuickSnippetGroups } from "../public/js/utils/snippet-storage.js";

function createTempDir() {
  return mkdtempSync(join(tmpdir(), "nextplanner-snippets-"));
}

describe("JsonSnippetStore", () => {
  let tempDir;
  let storageFile;
  /** @type {JsonSnippetStore | null} */
  let store;

  beforeEach(() => {
    tempDir = createTempDir();
    storageFile = join(tempDir, "team-snippets.json");
    store = null;
  });

  afterEach(async () => {
    await store?.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("initialisiert eine Standardbibliothek mit Zeitstempel", async () => {
    store = new JsonSnippetStore({ storageFile });
    const library = await store.getLibrary();

    assert.ok(Array.isArray(library.groups));
    assert.ok(library.groups.length > 0);
    assert.ok(typeof library.updatedAt === "string");
    assert.ok(!Number.isNaN(new Date(library.updatedAt).getTime()));

    const persisted = JSON.parse(readFileSync(storageFile, "utf8"));
    assert.equal(persisted.updatedAt, library.updatedAt);
    assert.ok(Array.isArray(persisted.groups));
  });

  it("bereinigt unvollständige Daten beim Laden und persistiert das Ergebnis", async () => {
    const rawGroups = [
      {
        title: 42,
        description: null,
        items: [
          { label: null, snippet: null, appendNewline: "yes" },
          null,
        ],
      },
    ];
    writeFileSync(
      storageFile,
      JSON.stringify({ updatedAt: "2024-01-01", groups: rawGroups }, null, 2),
      "utf8",
    );

    store = new JsonSnippetStore({ storageFile });
    const library = await store.getLibrary();

    assert.equal(library.groups[0].title, "Gruppe");
    assert.equal(library.groups[0].items[0].label, "Baustein");
    assert.equal(library.groups[0].items[0].appendNewline, true);
    assert.equal(library.groups[0].items[0].cursorOffset, 0);
    assert.ok(library.updatedAt.endsWith("Z"));

    const persisted = JSON.parse(readFileSync(storageFile, "utf8"));
    assert.deepEqual(persisted.groups, library.groups);
    assert.equal(persisted.updatedAt, library.updatedAt);
  });

  it("überspringt No-Op-Updates und behält den Zeitstempel bei", async () => {
    store = new JsonSnippetStore({ storageFile });
    const initial = await store.getLibrary();

    const result = await store.replaceLibrary(initial.groups);
    assert.equal(result.updatedAt, initial.updatedAt);
  });

  it("reiht Schreibvorgänge sequenziell ein", async () => {
    store = new JsonSnippetStore({ storageFile });
    await store.getLibrary();

    const first = [
      {
        title: "Neue Gruppe",
        description: "",
        items: [
          { label: "Item A", snippet: "A", appendNewline: false },
        ],
      },
    ];
    const second = [
      {
        title: "Zweite Gruppe",
        description: "",
        items: [
          { label: "Item B", snippet: "B", appendNewline: true },
        ],
      },
    ];

    await Promise.all([
      store.replaceLibrary(first),
      store.replaceLibrary(second),
    ]);

    const library = await store.getLibrary();
    const persisted = JSON.parse(readFileSync(storageFile, "utf8"));
    const expected = sanitizeQuickSnippetGroups(second);

    assert.deepEqual(library.groups, expected);
    assert.deepEqual(persisted.groups, expected);
  });
});
