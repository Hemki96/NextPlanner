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
    assert.equal(config.env.isDevelopment, true);
    assert.equal(config.security.defaultUsers.admin.username, "admin");
    assert.equal(config.security.defaultUsers.admin.password, "admin");
    assert.equal(config.security.defaultUsers.coach.username, "coach");
    assert.equal(config.security.defaultUsers.coach.password, "coach");
    assert.equal(config.security.defaultUsers.athlet.username, "athlet");
    assert.equal(config.security.defaultUsers.athlet.password, "athlet");
  });

  it("ignoriert überschreibende Credential-Umgebungsvariablen und nutzt die statischen Konten", () => {
    const config = buildRuntimeConfig({
      NODE_ENV: "production",
      NEXTPLANNER_LOGIN_USER: "root",
      NEXTPLANNER_LOGIN_PASSWORD: "SicheresPasswort!",
      ADMIN_USER: "something",
      ADMIN_PASSWORD: "else",
    });
    assert.equal(config.security.defaultUsers.admin.username, "admin");
    assert.equal(config.security.defaultUsers.admin.password, "admin");
    assert.equal(config.security.defaultUsers.coach.username, "coach");
    assert.equal(config.security.defaultUsers.athlet.username, "athlet");
  });

  it("aggregiert Validierungsfehler", () => {
    assert.throws(
      () =>
        buildRuntimeConfig({
          NODE_ENV: "production",
          PORT: "abc",
          SESSION_TTL_MS: "-5",
        }),
      (error) => {
        const message = error instanceof Error ? error.message : String(error);
        return (
          message.includes("Invalid runtime config") &&
          message.includes("PORT") &&
          message.includes("SESSION_TTL_MS")
        );
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
});
