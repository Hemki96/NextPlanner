import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_ALLOWED_ORIGINS,
  DEFAULT_DATA_DIR,
  DEFAULT_DEV_CREDENTIALS,
  RuntimeConfigError,
  buildRuntimeConfig,
} from "../server/config/runtime-config.js";

test("production requires explicit credentials", () => {
  assert.throws(
    () =>
      buildRuntimeConfig({
        NODE_ENV: "production",
      }),
    (error) => {
      assert.ok(error instanceof RuntimeConfigError);
      assert.equal(error.errors.length, 3);
      assert.ok(error.message.includes("Seed-Credentials"));
      return true;
    },
  );
});

test("development falls back to default credentials and allowed origins", () => {
  const config = buildRuntimeConfig({ NODE_ENV: "development" });
  assert.deepEqual(config.credentials, DEFAULT_DEV_CREDENTIALS);
  assert.deepEqual(config.allowedOrigins, DEFAULT_ALLOWED_ORIGINS);
  assert.equal(config.isProduction, false);
});

test("dataDir falls back to repo data directory", () => {
  const config = buildRuntimeConfig();
  assert.equal(config.dataDir, DEFAULT_DATA_DIR);
});

test("secure cookies resolve from environment", () => {
  const prodConfig = buildRuntimeConfig({
    NODE_ENV: "production",
    NEXTPLANNER_ADMIN_USER: "prod-admin",
    NEXTPLANNER_ADMIN_PASSWORD: "prod-secret",
    NEXTPLANNER_EDITOR_USER: "prod-editor",
    NEXTPLANNER_EDITOR_PASSWORD: "prod-secret",
    NEXTPLANNER_USER: "prod-user",
    NEXTPLANNER_USER_PASSWORD: "prod-secret",
  });
  assert.equal(prodConfig.secureCookies, true);

  const devConfig = buildRuntimeConfig({ NODE_ENV: "development", COOKIE_SECURE: "false" });
  assert.equal(devConfig.secureCookies, false);

  assert.throws(
    () => buildRuntimeConfig({ NODE_ENV: "development", COOKIE_SECURE: "sometimes" }),
    (error) => {
      assert.ok(error instanceof RuntimeConfigError);
      assert.ok(error.message.includes("COOKIE_SECURE"));
      return true;
    },
  );
});
