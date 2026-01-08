import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { test as base, expect } from "@playwright/test";

import { buildRuntimeConfig } from "../../server/config/runtime-config.js";
import { createServer } from "../../server/app.js";
import { JsonPlanStore } from "../../server/stores/json-plan-store.js";
import { JsonSnippetStore } from "../../server/stores/json-snippet-store.js";
import { JsonTemplateStore } from "../../server/stores/json-template-store.js";
import { JsonHighlightConfigStore } from "../../server/stores/json-highlight-config-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

function createTempDirectory(prefix = "nextplanner-e2e-") {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

async function startServer() {
  const tempDir = createTempDirectory();
  const config = buildRuntimeConfig({
    NODE_ENV: "test",
    NEXTPLANNER_DATA_DIR: tempDir,
  });

  const planStore = new JsonPlanStore({ storageFile: path.join(tempDir, "plans.json") });
  const snippetStore = new JsonSnippetStore({ storageFile: path.join(tempDir, "snippets.json") });
  const templateStore = new JsonTemplateStore({ storageFile: path.join(tempDir, "templates.json") });
  const highlightConfigStore = new JsonHighlightConfigStore({
    storageFile: path.join(tempDir, "highlight.json"),
  });

  const server = createServer({
    config,
    store: planStore,
    snippetStore,
    templateStore,
    highlightConfigStore,
    publicDir: path.join(repoRoot, "public"),
  });

  server.listen(0);
  await once(server, "listening");

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseURL = `http://127.0.0.1:${port}`;

  return {
    tempDir,
    baseURL,
    server,
    stores: {
      planStore,
      snippetStore,
      templateStore,
      highlightConfigStore,
    },
    async stop() {
      await new Promise((resolve) => server.close(resolve));
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

const test = base.extend({
  server: async ({}, use) => {
    const context = await startServer();
    await use(context);
    await context.stop();
  },
});

export { test, expect };
