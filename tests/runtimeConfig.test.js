import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildRuntimeConfig } from "../server/config/runtime-config.js";

describe("runtime config validation", () => {
  it("fällt auf Standardwerte zurück und setzt Entwicklungs-Defaults", () => {
    const config = buildRuntimeConfig({ NODE_ENV: "development" });
    assert.equal(config.server.port, 3000);
    assert.ok(config.paths.dataDir.endsWith("data"));
    assert.deepEqual(config.server.allowedOrigins, ["http://localhost:3000"]);
    assert.equal(config.security.session.ttlMs > 0, true);
  });

  it("erzwingt sichere Passwörter in Produktion", () => {
    assert.throws(
      () =>
        buildRuntimeConfig({
          NODE_ENV: "production",
          NEXTPLANNER_ADMIN_USER: "admin",
        }),
      /Missing required credentials/i,
    );
  });

  it("aggregiert Validierungsfehler", () => {
    assert.throws(
      () =>
        buildRuntimeConfig({
          NODE_ENV: "production",
          PORT: "abc",
          SESSION_TTL_MS: "-5",
          NEXTPLANNER_ADMIN_PASSWORD: "",
          NEXTPLANNER_EDITOR_PASSWORD: "",
          NEXTPLANNER_USER_PASSWORD: "",
        }),
      (error) => {
        const message = error instanceof Error ? error.message : String(error);
        return message.includes("Invalid runtime config") && message.includes("PORT") && message.includes("SESSION_TTL_MS");
      },
    );
  });
});
