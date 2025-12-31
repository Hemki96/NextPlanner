import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it, mock } from "node:test";

import { DEFAULT_DATA_DIR, buildRuntimeConfig } from "../server/config/runtime-config.js";

describe("runtime config validation", () => {
  it("fällt auf Standardwerte zurück und setzt Entwicklungs-Defaults", () => {
    const config = buildRuntimeConfig({ NODE_ENV: "development" });
    assert.equal(config.server.port, 3000);
    assert.ok(config.paths.dataDir.endsWith("data"));
    assert.deepEqual(config.server.allowedOrigins, ["http://localhost:3000"]);
    assert.equal(config.security.session.ttlMs > 0, true);
    assert.equal(config.env.environment, "poet");
    assert.equal(config.security.devAuth.enabled, false);
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

  it("fällt auf das Default-Datenverzeichnis zurück, wenn das konfigurierte nicht beschreibbar ist", () => {
    const originalMkdirSync = fs.mkdirSync;
    const blockedPath = path.join("/", "data");
    const mkdirMock = mock.method(fs, "mkdirSync", (dir, options) => {
      if (dir === blockedPath) {
        const error = new Error("permission denied");
        error.code = "EACCES";
        throw error;
      }
      return originalMkdirSync(dir, options);
    });

    try {
      const config = buildRuntimeConfig({ NEXTPLANNER_DATA_DIR: blockedPath, NODE_ENV: "development" });
      assert.equal(config.paths.dataDir, DEFAULT_DATA_DIR);
      assert.ok(
        (config.warnings ?? []).some((warning) => warning.includes(blockedPath) && warning.includes(DEFAULT_DATA_DIR)),
      );
    } finally {
      mkdirMock.mock.restore();
    }
  });

  it("aktiviert Dev-Auth mit fixem Passwort im dev-Environment", () => {
    const config = buildRuntimeConfig({ NODE_ENV: "development", NEXTPLANNER_ENV: "dev" });
    assert.equal(config.env.devEnvironment, true);
    assert.equal(config.security.devAuth.enabled, true);
    assert.equal(config.security.devAuth.defaultPassword, "Test123");
    const devUsers = config.security.devAuth.users.map((user) => user.username);
    assert.deepEqual(devUsers.sort(), ["admin", "athlete", "coach"].sort());
  });

  it("wirft bei unbekannten Environment-Profilen", () => {
    assert.throws(() => buildRuntimeConfig({ NEXTPLANNER_ENV: "staging" }), /NEXTPLANNER_ENV/);
  });
});
