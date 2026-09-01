import logger from "@app/logger/logger";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRedisClient = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  eval: vi.fn(),
  incr: vi.fn(),
}));

const mockDistributedLock = vi.hoisted(() => vi.fn());
const mockDistributedUnlock = vi.hoisted(() => vi.fn());

vi.mock("@app/logger/logger", () => ({
  default: {
    error: vi.fn(),
  },
}));

vi.mock("@app/lib/api/redis", () => ({
  getRedisCacheClient: vi.fn().mockResolvedValue(mockRedisClient),
}));

vi.mock("@app/lib/lock", () => ({
  distributedLock: mockDistributedLock,
  distributedUnlock: mockDistributedUnlock,
}));

// Import actual cache module to bypass the global mock in vite.setup.ts
vi.mock("@app/lib/utils/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/utils/cache")>();
  return actual;
});

import {
  batchInvalidateCacheWithRedis,
  cacheWithRedis,
  invalidateCacheAfterCommit,
  invalidateCacheWithRedis,
  warmCacheWithRedis,
} from "@app/lib/utils/cache";

function generationKey(valueKey: string): string {
  return `${valueKey}:generation`;
}

/**
 * Default eval mock: generation-guarded SET delegates to get/set; invalidate
 * deletes value keys and increments `:generation` companions via get/set.
 */
function installDefaultEvalMock(store?: Map<string, string>) {
  mockRedisClient.eval.mockImplementation(
    async (
      script: string,
      { keys, arguments: argv }: { keys: string[]; arguments: string[] }
    ) => {
      if (script.includes("INCR")) {
        for (const key of keys) {
          if (store) {
            store.delete(key);
            const genKey = generationKey(key);
            const next = String(Number(store.get(genKey) ?? "0") + 1);
            store.set(genKey, next);
          } else {
            await mockRedisClient.del(key);
            const genKey = generationKey(key);
            const current = await mockRedisClient.get(genKey);
            await mockRedisClient.set(
              genKey,
              String(Number(current ?? "0") + 1)
            );
          }
        }
        return keys.length;
      }

      const [valueKey, genKey] = keys;
      const [expectedGen, value, ttl] = argv;
      const current = store
        ? (store.get(genKey) ?? null)
        : await mockRedisClient.get(genKey);
      if ((current ?? "") !== expectedGen) {
        return 0;
      }
      if (store) {
        store.set(valueKey, value);
      } else if (ttl) {
        await mockRedisClient.set(valueKey, value, { PX: Number(ttl) });
      } else {
        await mockRedisClient.set(valueKey, value);
      }
      return 1;
    }
  );
}

function installInMemoryRedis() {
  const store = new Map<string, string>();
  mockRedisClient.get.mockImplementation(
    async (key: string) => store.get(key) ?? null
  );
  mockRedisClient.set.mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
    return "OK";
  });
  mockRedisClient.del.mockImplementation(async (key: string | string[]) => {
    const keys = Array.isArray(key) ? key : [key];
    let deleted = 0;
    for (const k of keys) {
      if (store.delete(k)) {
        deleted++;
      }
    }
    return deleted;
  });
  installDefaultEvalMock(store);
  return store;
}

describe("invalidateCacheAfterCommit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls invalidateFn immediately when no transaction provided", async () => {
    const invalidateFn = vi.fn().mockResolvedValue(undefined);

    invalidateCacheAfterCommit(undefined, invalidateFn);

    // Wait for the promise to resolve
    await new Promise((resolve) => setImmediate(resolve));

    expect(invalidateFn).toHaveBeenCalledOnce();
  });

  it("defers invalidateFn until transaction commits", async () => {
    const invalidateFn = vi.fn().mockResolvedValue(undefined);
    const afterCommitCallbacks: (() => void)[] = [];

    const mockTransaction = {
      afterCommit: vi.fn((cb: () => void) => {
        afterCommitCallbacks.push(cb);
      }),
    };

    invalidateCacheAfterCommit(
      mockTransaction as unknown as Parameters<
        typeof invalidateCacheAfterCommit
      >[0],
      invalidateFn
    );

    // invalidateFn should not be called yet
    expect(invalidateFn).not.toHaveBeenCalled();
    expect(mockTransaction.afterCommit).toHaveBeenCalledOnce();

    // Simulate transaction commit
    afterCommitCallbacks.forEach((cb) => cb());

    // Wait for the promise to resolve
    await new Promise((resolve) => setImmediate(resolve));

    expect(invalidateFn).toHaveBeenCalledOnce();
  });

  it("logs error with panic: true when invalidateFn fails without transaction", async () => {
    const testError = new Error("Cache invalidation failed");
    const invalidateFn = vi.fn().mockRejectedValue(testError);

    invalidateCacheAfterCommit(undefined, invalidateFn);

    // Wait for the promise to reject and be caught
    await new Promise((resolve) => setImmediate(resolve));

    expect(logger.error).toHaveBeenCalledWith(
      { panic: true, err: testError },
      "Failed to invalidate cache after transaction commit"
    );
  });

  it("logs error with panic: true when invalidateFn fails after transaction commit", async () => {
    const testError = new Error("Cache invalidation failed");
    const invalidateFn = vi.fn().mockRejectedValue(testError);
    const afterCommitCallbacks: (() => void)[] = [];

    const mockTransaction = {
      afterCommit: vi.fn((cb: () => void) => {
        afterCommitCallbacks.push(cb);
      }),
    };

    invalidateCacheAfterCommit(
      mockTransaction as unknown as Parameters<
        typeof invalidateCacheAfterCommit
      >[0],
      invalidateFn
    );

    // Simulate transaction commit
    afterCommitCallbacks.forEach((cb) => cb());

    // Wait for the promise to reject and be caught
    await new Promise((resolve) => setImmediate(resolve));

    expect(logger.error).toHaveBeenCalledWith(
      { panic: true, err: testError },
      "Failed to invalidate cache after transaction commit"
    );
  });
});

describe("cacheWithRedis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisClient.get.mockReset();
    mockRedisClient.set.mockReset();
    mockRedisClient.del.mockReset();
    mockRedisClient.eval.mockReset();
    mockDistributedLock.mockReset();
    mockDistributedUnlock.mockReset();
    installDefaultEvalMock();
  });

  describe("basic caching behavior", () => {
    it("returns cached value on cache hit", async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: "fresh" });
      Object.defineProperty(mockFn, "name", { value: "testFn" });

      mockRedisClient.get.mockResolvedValue(JSON.stringify({ data: "cached" }));

      const cachedFn = cacheWithRedis(mockFn, (arg: string) => arg, {});
      const result = await cachedFn("key1");

      expect(result).toEqual({ data: "cached" });
      expect(mockFn).not.toHaveBeenCalled();
      expect(mockRedisClient.get).toHaveBeenCalledWith(
        "cacheWithRedis-testFn-key1"
      );
    });

    it("calls function and caches result on cache miss", async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: "fresh" });
      Object.defineProperty(mockFn, "name", { value: "testFn" });

      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.set.mockResolvedValue("OK");

      const cachedFn = cacheWithRedis(mockFn, (arg: string) => arg, {});
      const result = await cachedFn("key1");

      expect(result).toEqual({ data: "fresh" });
      expect(mockFn).toHaveBeenCalledWith("key1");
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        "cacheWithRedis-testFn-key1",
        JSON.stringify({ data: "fresh" })
      );
    });

    it("generates correct cache key using resolver", async () => {
      const mockFn = vi.fn().mockResolvedValue("result");
      Object.defineProperty(mockFn, "name", { value: "myFunc" });

      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.set.mockResolvedValue("OK");

      const cachedFn = cacheWithRedis(
        mockFn,
        (a: string, b: number) => `${a}-${b}`,
        {}
      );
      await cachedFn("foo", 123);

      expect(mockRedisClient.get).toHaveBeenCalledWith(
        "cacheWithRedis-myFunc-foo-123"
      );
    });

    it("uses an explicit stable cache id instead of the loader name", async () => {
      const mockFn = vi.fn().mockResolvedValue("result");
      Object.defineProperty(mockFn, "name", { value: "renamableLoader" });
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.set.mockResolvedValue("OK");

      const cachedFn = cacheWithRedis(mockFn, (arg: string) => arg, {
        cacheId: "workspace_by_sid",
      });
      await cachedFn("workspace-1");

      expect(mockRedisClient.get).toHaveBeenCalledWith(
        "cacheWithRedis-workspace_by_sid-workspace-1"
      );
    });

    it("reads the new key and copies the hit to the previous key", async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: "fresh" });
      mockRedisClient.get.mockResolvedValue(
        JSON.stringify({ data: "from-previous-key" })
      );
      mockRedisClient.set.mockResolvedValue("OK");

      const cachedFn = cacheWithRedis(mockFn, (arg: string) => `v3:${arg}`, {
        cacheId: "workspace_by_sid",
        ttlMs: 60_000,
        migration: {
          previousKey: {
            cacheId: "_fetchByIdUncached",
            resolver: (arg: string) => `workspace:v2:${arg}`,
          },
          readFrom: "new",
          copyToOtherKey: "after_read",
        },
      });
      const result = await cachedFn("workspace-1");

      expect(result).toEqual({ data: "from-previous-key" });
      expect(mockFn).not.toHaveBeenCalled();
      expect(mockRedisClient.get).toHaveBeenCalledWith(
        "cacheWithRedis-workspace_by_sid-v3:workspace-1"
      );
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        "cacheWithRedis-_fetchByIdUncached-workspace:v2:workspace-1",
        JSON.stringify({ data: "from-previous-key" }),
        { PX: 60_000 }
      );
    });

    it("can read the previous key without copying a cache hit", async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: "fresh" });
      mockRedisClient.get.mockResolvedValue(
        JSON.stringify({ data: "legacy-semantics" })
      );

      const cachedFn = cacheWithRedis(mockFn, (arg: string) => `v3:${arg}`, {
        cacheId: "workspace_by_sid",
        migration: {
          previousKey: {
            cacheId: "_fetchByIdUncached",
            resolver: (arg: string) => `workspace:v2:${arg}`,
          },
          readFrom: "previous",
          copyToOtherKey: "after_load",
        },
      });
      const result = await cachedFn("workspace-1");

      expect(result).toEqual({ data: "legacy-semantics" });
      expect(mockFn).not.toHaveBeenCalled();
      expect(mockRedisClient.set).not.toHaveBeenCalled();
    });

    it("refreshes both keys when the migration key misses", async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: "fresh" });
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.set.mockResolvedValue("OK");

      const cachedFn = cacheWithRedis(mockFn, (arg: string) => `v3:${arg}`, {
        cacheId: "workspace_by_sid",
        migration: {
          previousKey: {
            cacheId: "_fetchByIdUncached",
            resolver: (arg: string) => `workspace:v2:${arg}`,
          },
          readFrom: "previous",
          copyToOtherKey: "after_load",
        },
      });
      const result = await cachedFn("workspace-1");

      expect(result).toEqual({ data: "fresh" });
      expect(mockRedisClient.get).not.toHaveBeenCalledWith(
        "cacheWithRedis-workspace_by_sid-v3:workspace-1"
      );
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        "cacheWithRedis-_fetchByIdUncached-workspace:v2:workspace-1",
        JSON.stringify({ data: "fresh" })
      );
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        "cacheWithRedis-workspace_by_sid-v3:workspace-1",
        JSON.stringify({ data: "fresh" })
      );
    });
  });

  describe("TTL handling", () => {
    it("sets TTL (PX) when ttlMs is provided", async () => {
      const mockFn = vi.fn().mockResolvedValue("data");
      Object.defineProperty(mockFn, "name", { value: "testFn" });

      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.set.mockResolvedValue("OK");

      const cachedFn = cacheWithRedis(mockFn, (arg: string) => arg, {
        ttlMs: 60000,
      });
      await cachedFn("key1");

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        "cacheWithRedis-testFn-key1",
        JSON.stringify("data"),
        { PX: 60000 }
      );
    });

    it("does not set TTL when ttlMs is undefined", async () => {
      const mockFn = vi.fn().mockResolvedValue("data");
      Object.defineProperty(mockFn, "name", { value: "testFn" });

      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.set.mockResolvedValue("OK");

      const cachedFn = cacheWithRedis(mockFn, (arg: string) => arg, {});
      await cachedFn("key1");

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        "cacheWithRedis-testFn-key1",
        JSON.stringify("data")
      );
    });

    it("throws error when ttlMs > 24 hours", () => {
      const mockFn = vi.fn().mockResolvedValue("data");

      expect(() =>
        cacheWithRedis(mockFn, (arg: string) => arg, {
          ttlMs: 25 * 60 * 60 * 1000,
        })
      ).toThrow("ttlMs should be less than 24 hours");
    });

    it("resolves ttlMs as a function of the call's own args", async () => {
      const mockFn = vi.fn().mockResolvedValue("data");
      Object.defineProperty(mockFn, "name", { value: "testFn" });

      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.set.mockResolvedValue("OK");

      const cachedFn = cacheWithRedis(
        mockFn,
        (_key: string, ttl: number) => `${_key}-${ttl}`,
        {
          ttlMs: (_key: string, ttl: number) => ttl,
        }
      );
      await cachedFn("key1", 12345);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        "cacheWithRedis-testFn-key1-12345",
        JSON.stringify("data"),
        { PX: 12345 }
      );
    });

    it("throws only once a call resolves a function ttlMs above 24 hours", async () => {
      const mockFn = vi.fn().mockResolvedValue("data");

      const cachedFn = cacheWithRedis(mockFn, (ttl: number) => `${ttl}`, {
        ttlMs: (ttl: number) => ttl,
      });

      await expect(cachedFn(25 * 60 * 60 * 1000)).rejects.toThrow(
        "ttlMs should be less than 24 hours"
      );
    });
  });

  describe("null value handling (cacheNullValues option)", () => {
    it("caches null when cacheNullValues is true (default)", async () => {
      const mockFn = vi.fn().mockResolvedValue(null);
      Object.defineProperty(mockFn, "name", { value: "testFn" });

      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.set.mockResolvedValue("OK");

      const cachedFn = cacheWithRedis(mockFn, (arg: string) => arg, {});
      const result = await cachedFn("key1");

      expect(result).toBeNull();
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        "cacheWithRedis-testFn-key1",
        "null"
      );
    });

    it("does not cache null when cacheNullValues is false", async () => {
      const mockFn = vi.fn().mockResolvedValue(null);
      Object.defineProperty(mockFn, "name", { value: "testFn" });

      mockRedisClient.get.mockResolvedValue(null);

      const cachedFn = cacheWithRedis(mockFn, (arg: string) => arg, {
        cacheNullValues: false,
      });
      const result = await cachedFn("key1");

      expect(result).toBeNull();
      expect(mockRedisClient.set).not.toHaveBeenCalled();
    });

    it("does not cache undefined when cacheNullValues is false", async () => {
      const mockFn = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(mockFn, "name", { value: "testFn" });

      mockRedisClient.get.mockResolvedValue(null);

      const cachedFn = cacheWithRedis(mockFn, (arg: string) => arg, {
        cacheNullValues: false,
      });
      await cachedFn("key1");

      expect(mockRedisClient.set).not.toHaveBeenCalled();
    });
  });

  describe("distributed lock behavior (useDistributedLock: true)", () => {
    it("acquires and releases distributed lock", async () => {
      const mockFn = vi.fn().mockResolvedValue("data");
      Object.defineProperty(mockFn, "name", { value: "testFn" });

      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.set.mockResolvedValue("OK");
      mockDistributedLock.mockResolvedValue("lock-value-123");

      const cachedFn = cacheWithRedis(mockFn, (arg: string) => arg, {
        useDistributedLock: true,
      });
      await cachedFn("key1");

      expect(mockDistributedLock).toHaveBeenCalledWith(
        mockRedisClient,
        "cacheWithRedis-testFn-key1"
      );
      expect(mockDistributedUnlock).toHaveBeenCalledWith(
        mockRedisClient,
        "cacheWithRedis-testFn-key1",
        "lock-value-123"
      );
    });

    it("returns null immediately when skipIfLocked is true and lock is taken", async () => {
      const mockFn = vi.fn().mockResolvedValue("data");
      Object.defineProperty(mockFn, "name", { value: "testFn" });

      mockRedisClient.get.mockResolvedValue(null);
      mockDistributedLock.mockResolvedValue(undefined);

      const cachedFn = cacheWithRedis(mockFn, (arg: string) => arg, {
        useDistributedLock: true,
        skipIfLocked: true,
      });
      const result = await cachedFn("key1");

      expect(result).toBeNull();
      expect(mockFn).not.toHaveBeenCalled();
      expect(mockDistributedUnlock).not.toHaveBeenCalled();
    });

    it("spin-waits when lock is taken, then returns cached value", async () => {
      const mockFn = vi.fn().mockResolvedValue("data");
      Object.defineProperty(mockFn, "name", { value: "testFn" });

      let lockCallCount = 0;
      let getCallCount = 0;

      mockRedisClient.get.mockImplementation(async () => {
        getCallCount++;
        if (getCallCount === 1) {
          return null;
        }
        if (getCallCount === 2) {
          return null;
        }
        return JSON.stringify("cached-by-another");
      });

      mockDistributedLock.mockImplementation(async () => {
        lockCallCount++;
        if (lockCallCount <= 2) {
          return undefined;
        }
        return "lock-value";
      });

      const cachedFn = cacheWithRedis(mockFn, (arg: string) => arg, {
        useDistributedLock: true,
      });

      const result = await cachedFn("key1");

      expect(result).toBe("cached-by-another");
      expect(mockFn).not.toHaveBeenCalled();
      expect(lockCallCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe("in-memory lock behavior (useDistributedLock: false)", () => {
    it("uses in-memory lock to prevent concurrent calls", async () => {
      const callOrder: string[] = [];
      const resolveContainer: { resolve?: () => void } = {};
      const firstPromise = new Promise<void>((resolve) => {
        resolveContainer.resolve = resolve;
      });

      const mockFn = vi.fn().mockImplementation(async (arg: string) => {
        callOrder.push(`start-${arg}`);
        if (arg === "key1") {
          await firstPromise;
        }
        callOrder.push(`end-${arg}`);
        return `result-${arg}`;
      });
      Object.defineProperty(mockFn, "name", { value: "testFn" });

      // Track cached values so get returns what was set
      const cache = new Map<string, string>();
      mockRedisClient.get.mockImplementation(
        async (key: string) => cache.get(key) ?? null
      );
      mockRedisClient.set.mockImplementation(
        async (key: string, value: string) => {
          cache.set(key, value);
          return "OK";
        }
      );

      const cachedFn = cacheWithRedis(mockFn, (arg: string) => arg, {});

      const promise1 = cachedFn("key1");
      const promise2 = cachedFn("key1");

      await new Promise((resolve) => setTimeout(resolve, 10));

      if (resolveContainer.resolve) {
        resolveContainer.resolve();
      }

      await Promise.all([promise1, promise2]);

      expect(callOrder).toEqual(["start-key1", "end-key1"]);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it("allows parallel calls for different keys", async () => {
      const mockFn = vi.fn().mockImplementation(async (arg: string) => {
        return `result-${arg}`;
      });
      Object.defineProperty(mockFn, "name", { value: "testFn" });

      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.set.mockResolvedValue("OK");

      const cachedFn = cacheWithRedis(mockFn, (arg: string) => arg, {});

      await Promise.all([cachedFn("key1"), cachedFn("key2")]);

      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });
});

describe("invalidateCacheWithRedis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisClient.del.mockReset();
    mockRedisClient.eval.mockReset();
    mockRedisClient.get.mockReset();
    mockRedisClient.set.mockReset();
    installDefaultEvalMock();
  });

  it("deletes the cache key and bumps its generation", async () => {
    const mockFn = vi.fn();
    Object.defineProperty(mockFn, "name", { value: "testFn" });

    const invalidateFn = invalidateCacheWithRedis(mockFn, (arg: string) => arg);
    await invalidateFn("key1");

    expect(mockRedisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining("INCR"),
      {
        keys: ["cacheWithRedis-testFn-key1"],
        arguments: [],
      }
    );
    expect(mockRedisClient.del).toHaveBeenCalledWith(
      "cacheWithRedis-testFn-key1"
    );
    expect(mockRedisClient.set).toHaveBeenCalledWith(
      "cacheWithRedis-testFn-key1:generation",
      "1"
    );
  });

  it("uses correct key format with multi-arg resolver", async () => {
    const mockFn = vi.fn();
    Object.defineProperty(mockFn, "name", { value: "myFunc" });

    const invalidateFn = invalidateCacheWithRedis(
      mockFn,
      (a: string, b: number) => `${a}-${b}`
    );
    await invalidateFn("foo", 42);

    expect(mockRedisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining("INCR"),
      {
        keys: ["cacheWithRedis-myFunc-foo-42"],
        arguments: [],
      }
    );
  });

  it("uses the same explicit stable cache id for invalidation", async () => {
    const mockFn = vi.fn();
    Object.defineProperty(mockFn, "name", { value: "renamableLoader" });

    const invalidateFn = invalidateCacheWithRedis(
      mockFn,
      (arg: string) => arg,
      { cacheId: "workspace_by_sid" }
    );
    await invalidateFn("workspace-1");

    expect(mockRedisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining("INCR"),
      {
        keys: ["cacheWithRedis-workspace_by_sid-workspace-1"],
        arguments: [],
      }
    );
  });

  it("invalidates both keys during a key migration", async () => {
    const mockFn = vi.fn();

    const invalidateFn = invalidateCacheWithRedis(
      mockFn,
      (arg: string) => `v3:${arg}`,
      {
        cacheId: "workspace_by_sid",
        migration: {
          previousKey: {
            cacheId: "_fetchByIdUncached",
            resolver: (arg: string) => `workspace:v2:${arg}`,
          },
          readFrom: "new",
          copyToOtherKey: "after_read",
        },
      }
    );
    await invalidateFn("workspace-1");

    expect(mockRedisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining("INCR"),
      {
        keys: [
          "cacheWithRedis-workspace_by_sid-v3:workspace-1",
          "cacheWithRedis-_fetchByIdUncached-workspace:v2:workspace-1",
        ],
        arguments: [],
      }
    );
  });

  it("rejects a stale write that races with invalidation", async () => {
    const store = installInMemoryRedis();
    let dbValue: string[] = [];
    let releaseStaleLoad: (() => void) | undefined;
    const staleLoadGate = new Promise<void>((resolve) => {
      releaseStaleLoad = resolve;
    });
    let loadCount = 0;

    const mockFn = vi.fn().mockImplementation(async () => {
      loadCount++;
      // Snapshot at load start: the first call is the stale pre-invalidate read.
      const snapshot = [...dbValue];
      if (loadCount === 1) {
        await staleLoadGate;
      }
      return snapshot;
    });
    Object.defineProperty(mockFn, "name", { value: "featureFlags" });

    const resolver = (workspaceId: string) => workspaceId;
    const cachedFn = cacheWithRedis(mockFn, resolver, {
      cacheId: "feature_flags_by_workspace",
    });
    const invalidateFn = invalidateCacheWithRedis(mockFn, resolver, {
      cacheId: "feature_flags_by_workspace",
    });

    const staleRead = cachedFn("1");
    await new Promise((resolve) => setTimeout(resolve, 10));

    dbValue = ["pod_frame_tabs"];
    await invalidateFn("1");

    releaseStaleLoad?.();
    await expect(staleRead).resolves.toEqual([]);

    // Stale empty snapshot must not land in Redis after the invalidate.
    expect(
      store.get("cacheWithRedis-feature_flags_by_workspace-1")
    ).toBeUndefined();

    const fresh = await cachedFn("1");
    expect(fresh).toEqual(["pod_frame_tabs"]);
    expect(store.get("cacheWithRedis-feature_flags_by_workspace-1")).toBe(
      JSON.stringify(["pod_frame_tabs"])
    );
  });
});

describe("warmCacheWithRedis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisClient.get.mockReset();
    mockRedisClient.set.mockReset();
    mockRedisClient.eval.mockReset();
    installDefaultEvalMock();
  });

  it("writes JSON-stringified value at the same key cacheWithRedis would read", async () => {
    const fn = vi.fn().mockResolvedValue("data");
    Object.defineProperty(fn, "name", { value: "testFn" });
    mockRedisClient.get.mockResolvedValue(null);
    mockRedisClient.set.mockResolvedValue("OK");

    const warm = warmCacheWithRedis(fn, (arg: string) => arg, {
      ttlMs: 60000,
    });
    await warm("data", "key1");

    expect(mockRedisClient.set).toHaveBeenCalledWith(
      "cacheWithRedis-testFn-key1",
      JSON.stringify("data"),
      { PX: 60000 }
    );
  });

  it("omits TTL when ttlMs is not provided", async () => {
    const fn = vi.fn().mockResolvedValue("data");
    Object.defineProperty(fn, "name", { value: "testFn" });
    mockRedisClient.get.mockResolvedValue(null);
    mockRedisClient.set.mockResolvedValue("OK");

    const warm = warmCacheWithRedis(fn, (arg: string) => arg);
    await warm("data", "key1");

    expect(mockRedisClient.set).toHaveBeenCalledWith(
      "cacheWithRedis-testFn-key1",
      JSON.stringify("data")
    );
  });

  it("warmed value is then served by cacheWithRedis without invoking fn", async () => {
    const fn = vi.fn().mockResolvedValue("fresh");
    Object.defineProperty(fn, "name", { value: "testFn" });

    const store = installInMemoryRedis();
    const resolver = (arg: string) => arg;
    const warm = warmCacheWithRedis(fn, resolver, { ttlMs: 60000 });
    const cached = cacheWithRedis(fn, resolver, { ttlMs: 60000 });

    await warm("warmed", "key1");
    expect(store.get("cacheWithRedis-testFn-key1")).toBe(
      JSON.stringify("warmed")
    );
    const result = await cached("key1");

    expect(result).toBe("warmed");
    expect(fn).not.toHaveBeenCalled();
  });

  it("throws when ttlMs > 24 hours", () => {
    const fn = vi.fn();
    expect(() =>
      warmCacheWithRedis(fn, (arg: string) => arg, {
        ttlMs: 25 * 60 * 60 * 1000,
      })
    ).toThrow("ttlMs should be less than 24 hours");
  });
});

describe("batchInvalidateCacheWithRedis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisClient.del.mockReset();
    mockRedisClient.eval.mockReset();
    mockRedisClient.get.mockReset();
    mockRedisClient.set.mockReset();
    installDefaultEvalMock();
  });

  it("deletes multiple cache keys in single Redis call", async () => {
    const mockFn = vi.fn();
    Object.defineProperty(mockFn, "name", { value: "testFn" });

    const batchInvalidateFn = batchInvalidateCacheWithRedis(
      mockFn,
      (arg: string) => arg
    );
    await batchInvalidateFn([["key1"], ["key2"], ["key3"]]);

    expect(mockRedisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining("INCR"),
      {
        keys: [
          "cacheWithRedis-testFn-key1",
          "cacheWithRedis-testFn-key2",
          "cacheWithRedis-testFn-key3",
        ],
        arguments: [],
      }
    );
    expect(mockRedisClient.eval).toHaveBeenCalledTimes(1);
  });

  it("does nothing when argsList is empty", async () => {
    const mockFn = vi.fn();
    Object.defineProperty(mockFn, "name", { value: "testFn" });

    const batchInvalidateFn = batchInvalidateCacheWithRedis(
      mockFn,
      (arg: string) => arg
    );
    await batchInvalidateFn([]);

    expect(mockRedisClient.eval).not.toHaveBeenCalled();
  });

  it("uses correct key format for all keys", async () => {
    const mockFn = vi.fn();
    Object.defineProperty(mockFn, "name", { value: "myFunc" });

    const batchInvalidateFn = batchInvalidateCacheWithRedis(
      mockFn,
      (a: string, b: number) => `${a}-${b}`
    );
    await batchInvalidateFn([
      ["foo", 1],
      ["bar", 2],
    ]);

    expect(mockRedisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining("INCR"),
      {
        keys: ["cacheWithRedis-myFunc-foo-1", "cacheWithRedis-myFunc-bar-2"],
        arguments: [],
      }
    );
  });

  it("deletes canonical and previous keys in one Redis call", async () => {
    const mockFn = vi.fn();

    const batchInvalidateFn = batchInvalidateCacheWithRedis(
      mockFn,
      (arg: string) => `v2:${arg}`,
      {
        cacheId: "canonical",
        migration: {
          previousKey: {
            cacheId: "previous",
            resolver: (arg) => `v1:${arg}`,
          },
          readFrom: "new",
          copyToOtherKey: "after_read",
        },
      }
    );
    await batchInvalidateFn([["key1"], ["key2"]]);

    expect(mockRedisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining("INCR"),
      {
        keys: expect.arrayContaining([
          "cacheWithRedis-canonical-v2:key1",
          "cacheWithRedis-previous-v1:key1",
          "cacheWithRedis-canonical-v2:key2",
          "cacheWithRedis-previous-v1:key2",
        ]),
        arguments: [],
      }
    );
    expect(mockRedisClient.eval).toHaveBeenCalledTimes(1);
  });
});
