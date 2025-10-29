import test from "node:test";
import assert from "node:assert/strict";

const originalWindow = globalThis.window;
const originalCustomEvent = globalThis.CustomEvent;

class MockCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail ?? null;
  }
}

function createMockWindow() {
  const listeners = new Map();
  const storage = new Map();
  return {
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
      removeItem(key) {
        storage.delete(key);
      },
      clear() {
        storage.clear();
      },
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler);
    },
    dispatchEvent(event) {
      const handlers = listeners.get(event?.type);
      if (!handlers) {
        return true;
      }
      handlers.forEach((handler) => handler.call(this, event));
      return !event?.defaultPrevented;
    },
    requestAnimationFrame(callback) {
      return setTimeout(() => {
        callback(Date.now());
      }, 16);
    },
    cancelAnimationFrame(id) {
      clearTimeout(id);
    },
    __listeners: listeners,
    __storage: storage,
  };
}

const mockWindow = createMockWindow();

globalThis.window = mockWindow;
globalThis.CustomEvent = MockCustomEvent;

const highlightModule = await import("../public/js/utils/highlight-settings.js");
const {
  getHighlightSettings,
  getDefaultHighlightSettings,
  saveHighlightSettings,
  setHighlightEnabled,
  resetHighlightSettings,
  subscribeToHighlightSettings,
} = highlightModule;

const STORAGE_KEY = "nextplanner.highlightSettings.v1";

test.after(() => {
  if (originalWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }
  if (originalCustomEvent === undefined) {
    delete globalThis.CustomEvent;
  } else {
    globalThis.CustomEvent = originalCustomEvent;
  }
});

test("returns defaults when storage is empty", () => {
  mockWindow.localStorage.clear();
  const settings = getHighlightSettings();
  const defaults = getDefaultHighlightSettings();
  assert.deepEqual(settings, defaults);
});

test("setHighlightEnabled persists values and notifies subscribers", () => {
  mockWindow.localStorage.clear();
  const received = [];
  const unsubscribe = subscribeToHighlightSettings((nextSettings) => {
    received.push(nextSettings);
  });

  const updated = setHighlightEnabled("distance", false);
  const stored = JSON.parse(mockWindow.localStorage.getItem(STORAGE_KEY));

  assert.equal(updated.distance.enabled, false);
  assert.equal(stored.distance.enabled, false);
  assert.equal(received.length, 1);
  assert.equal(received[0].distance.enabled, false);

  unsubscribe();
});

test("resetHighlightSettings restores defaults and broadcasts change", () => {
  mockWindow.localStorage.clear();
  saveHighlightSettings({ heading: { enabled: false }, interval: { enabled: false } });

  let eventPayload = null;
  const unsubscribe = subscribeToHighlightSettings((settings) => {
    eventPayload = settings;
  });

  const reset = resetHighlightSettings();
  const defaults = getDefaultHighlightSettings();
  const stored = JSON.parse(mockWindow.localStorage.getItem(STORAGE_KEY));

  assert.deepEqual(reset, defaults);
  assert.deepEqual(stored, defaults);
  assert.deepEqual(eventPayload, defaults);

  unsubscribe();
});

test("reacts to storage events from other tabs", () => {
  mockWindow.localStorage.clear();
  mockWindow.localStorage.setItem(STORAGE_KEY, JSON.stringify({ heading: { enabled: false } }));

  let latest = null;
  const unsubscribe = subscribeToHighlightSettings((settings) => {
    latest = settings;
  });

  mockWindow.dispatchEvent({ type: "storage", key: STORAGE_KEY });

  assert.notEqual(latest, null);
  assert.equal(latest.heading.enabled, false);
  assert.equal(latest.distance.enabled, true);

  unsubscribe();
});
