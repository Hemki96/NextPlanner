import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { ApiError, apiRequest, get, post } from "../public/js/utils/api-client.js";

function createResponse({ status = 200, data = {}, etag = null } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        if (name.toLowerCase() === "etag") return etag;
        if (name.toLowerCase() === "content-type") return "application/json";
        if (name.toLowerCase() === "location") return null;
        return null;
      },
    },
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

describe("API-Client", () => {
  let originalWindow;
  let originalFetch;

  beforeEach(() => {
    originalWindow = globalThis.window;
    originalFetch = globalThis.fetch;
    globalThis.window = {
      location: { protocol: "http:", origin: "http://localhost:3000" },
    };
  });

  afterEach(() => {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  });

  it("wiederholes einen fehlgeschlagenen GET einmal und gibt die zweite Antwort zurück", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return calls === 1
        ? createResponse({ status: 503, data: { error: { message: "kurz offline" } } })
        : createResponse({ status: 200, data: { ok: true } });
    };

    const result = await get("/api/plans");
    assert.equal(calls, 2);
    assert.deepEqual(result.data, { ok: true });
  });

  it("wiederholt Client-Fehler und POST nicht", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return createResponse({ status: 412, data: { error: { message: "veraltet" } } });
    };
    await assert.rejects(() => apiRequest("/api/plans/1", { method: "PUT" }), ApiError);
    assert.equal(calls, 1);

    calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return createResponse({ status: 503, data: {} });
    };
    await assert.rejects(() => post("/api/plans", { json: { title: "x" } }), ApiError);
    assert.equal(calls, 1);
  });

  it("der Timeout gilt auch während des Lesens des Antwort-Bodys", async () => {
    globalThis.fetch = async (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });

    await assert.rejects(
      () => get("/api/plans", { timeout: 30, retries: 0 }),
      (error) => error instanceof ApiError && error.timeout === true,
    );
  });
});
