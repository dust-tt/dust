// @vitest-environment jsdom

import {
  FRAME_CACHE_MAX_ENTRIES,
  FRAME_CACHE_MAX_ENTRY_AGE_MS,
  FRAME_CACHE_MAX_FRAMES,
  FRAME_CACHE_MAX_ITEM_SIZE_BYTES,
  FRAME_CACHE_WRITE_DEBOUNCE_MS,
  FrameCachePersistence,
  frameCacheStorageKey,
} from "@viz/app/lib/frame-cache-persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = frameCacheStorageKey("viz-fil_1", "usr_123");

function makePersistence({
  cache = new Map<string, unknown>(),
  storage = window.localStorage,
  storageKey = STORAGE_KEY,
  nowMs,
}: {
  cache?: Map<string, unknown>;
  storage?: Storage;
  storageKey?: string;
  nowMs?: () => number;
} = {}) {
  return new FrameCachePersistence({ cache, storage, storageKey, nowMs });
}

function seedItem(
  storageKey: string,
  entries: [string, { data: unknown; updatedAtMs: number }][],
  updatedAtMs = Date.now()
) {
  window.localStorage.setItem(
    storageKey,
    JSON.stringify({ updatedAtMs, entries })
  );
}

describe("FrameCachePersistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips recorded entries through storage", () => {
    const cache = new Map<string, unknown>([["key-a", { data: [{ id: 1 }] }]]);
    const persistence = makePersistence({ cache });

    persistence.recordEntry("key-a");
    persistence.flush();

    const rehydrated = makePersistence({ cache: new Map() }).hydrate();
    expect(rehydrated.get("key-a")).toEqual([{ id: 1 }]);
  });

  it("debounces writes and flushes on the timer", () => {
    vi.useFakeTimers();
    const cache = new Map<string, unknown>([["key-a", { data: "value" }]]);
    const persistence = makePersistence({ cache });

    persistence.recordEntry("key-a");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

    vi.advanceTimersByTime(FRAME_CACHE_WRITE_DEBOUNCE_MS);
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("skips recorded keys without data and non-state cache values", () => {
    const cache = new Map<string, unknown>([
      ["key-loading", { isValidating: true }],
      ["key-primitive", 42],
    ]);
    const persistence = makePersistence({ cache });

    persistence.recordEntry("key-loading");
    persistence.recordEntry("key-primitive");
    persistence.recordEntry("key-missing");
    persistence.flush();

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("drops expired entries at hydration", () => {
    const nowMs = 1_000_000_000;
    seedItem(STORAGE_KEY, [
      ["fresh", { data: "fresh", updatedAtMs: nowMs - 1_000 }],
      [
        "expired",
        { data: "old", updatedAtMs: nowMs - FRAME_CACHE_MAX_ENTRY_AGE_MS - 1 },
      ],
    ]);

    const hydrated = makePersistence({ nowMs: () => nowMs }).hydrate();

    expect(hydrated.get("fresh")).toBe("fresh");
    expect(hydrated.has("expired")).toBe(false);
  });

  it("discards and removes malformed items", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    expect(makePersistence().hydrate().size).toBe(0);

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ bad: "shape" }));
    expect(makePersistence().hydrate().size).toBe(0);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("keeps only the most recently updated entries", () => {
    const cache = new Map<string, unknown>();
    let clock = 1_000;
    const persistence = makePersistence({ cache, nowMs: () => clock });

    for (let i = 0; i < FRAME_CACHE_MAX_ENTRIES + 10; i++) {
      const key = `key-${i}`;
      cache.set(key, { data: i });
      clock += 1;
      persistence.recordEntry(key);
    }
    persistence.flush();

    const hydrated = makePersistence({
      cache: new Map(),
      nowMs: () => clock,
    }).hydrate();
    expect(hydrated.size).toBe(FRAME_CACHE_MAX_ENTRIES);
    expect(hydrated.has("key-0")).toBe(false);
    expect(hydrated.has(`key-${FRAME_CACHE_MAX_ENTRIES + 9}`)).toBe(true);
  });

  it("drops least recently updated entries until the payload fits", () => {
    const bigValue = "x".repeat(FRAME_CACHE_MAX_ITEM_SIZE_BYTES / 2);
    const cache = new Map<string, unknown>([
      ["old-big", { data: bigValue }],
      ["new-big", { data: bigValue }],
      ["newest-small", { data: "small" }],
    ]);
    let clock = 1_000;
    const persistence = makePersistence({ cache, nowMs: () => clock });
    for (const key of ["old-big", "new-big", "newest-small"]) {
      clock += 1;
      persistence.recordEntry(key);
    }
    persistence.flush();

    const hydrated = makePersistence({
      cache: new Map(),
      nowMs: () => clock,
    }).hydrate();
    expect(hydrated.has("newest-small")).toBe(true);
    expect(hydrated.has("new-big")).toBe(true);
    expect(hydrated.has("old-big")).toBe(false);
  });

  it("forgets dropped entries", () => {
    seedItem(STORAGE_KEY, [
      ["kept", { data: "kept", updatedAtMs: Date.now() }],
      ["dropped", { data: "dropped", updatedAtMs: Date.now() }],
    ]);
    const persistence = makePersistence();
    persistence.hydrate();

    persistence.dropEntry("dropped");
    persistence.flush();

    const hydrated = makePersistence({ cache: new Map() }).hydrate();
    expect(hydrated.has("kept")).toBe(true);
    expect(hydrated.has("dropped")).toBe(false);
  });

  it("evicts other frames' items on quota pressure", () => {
    const otherKey = frameCacheStorageKey("viz-fil_other", "usr_123");
    seedItem(otherKey, [["k", { data: "other", updatedAtMs: 1 }]], 1);

    // Storage stub that refuses writes while the other frame's item is present.
    let denyWrites = true;
    const storage: Storage = {
      get length() {
        return window.localStorage.length;
      },
      key: (i: number) => window.localStorage.key(i),
      getItem: (k: string) => window.localStorage.getItem(k),
      removeItem: (k: string) => {
        window.localStorage.removeItem(k);
        denyWrites = false;
      },
      setItem: (k: string, v: string) => {
        if (denyWrites) {
          throw new Error("QuotaExceededError");
        }
        window.localStorage.setItem(k, v);
      },
      clear: () => window.localStorage.clear(),
    };

    const cache = new Map<string, unknown>([["key-a", { data: "value" }]]);
    const persistence = makePersistence({ cache, storage });
    persistence.recordEntry("key-a");
    persistence.flush();

    expect(window.localStorage.getItem(otherKey)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("caps the number of persisted frames on the origin", () => {
    for (let i = 0; i < FRAME_CACHE_MAX_FRAMES + 2; i++) {
      seedItem(
        frameCacheStorageKey(`viz-fil_${i}`, "usr_123"),
        [["k", { data: i, updatedAtMs: i + 1 }]],
        i + 1
      );
    }

    const cache = new Map<string, unknown>([["key-a", { data: "value" }]]);
    const persistence = makePersistence({ cache });
    persistence.recordEntry("key-a");
    persistence.flush();

    const frameKeys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith("dust:frameCache:v1:")) {
        frameKeys.push(key);
      }
    }
    expect(frameKeys.length).toBe(FRAME_CACHE_MAX_FRAMES);
    // The oldest seeded items are gone, the fresh write survives.
    expect(
      window.localStorage.getItem(frameCacheStorageKey("viz-fil_0", "usr_123"))
    ).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("stops persisting after dispose", () => {
    const cache = new Map<string, unknown>([["key-a", { data: "value" }]]);
    const persistence = makePersistence({ cache });
    persistence.dispose();

    persistence.recordEntry("key-a");
    persistence.flush();

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
