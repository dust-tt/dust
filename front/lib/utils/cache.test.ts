import logger from "@app/logger/logger";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRedisClient = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
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
} from "@app/lib/utils/cache";

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
    mockDistributedLock.mockReset();
    mockDistributedUnlock.mockReset();
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
  });

  it("deletes the correct cache key from Redis", async () => {
    const mockFn = vi.fn();
    Object.defineProperty(mockFn, "name", { value: "testFn" });

    mockRedisClient.del.mockResolvedValue(1);

    const invalidateFn = invalidateCacheWithRedis(mockFn, (arg: string) => arg);
    await invalidateFn("key1");

    expect(mockRedisClient.del).toHaveBeenCalledWith(
      "cacheWithRedis-testFn-key1"
    );
  });

  it("uses correct key format with multi-arg resolver", async () => {
    const mockFn = vi.fn();
    Object.defineProperty(mockFn, "name", { value: "myFunc" });

    mockRedisClient.del.mockResolvedValue(1);

    const invalidateFn = invalidateCacheWithRedis(
      mockFn,
      (a: string, b: number) => `${a}-${b}`
    );
    await invalidateFn("foo", 42);

    expect(mockRedisClient.del).toHaveBeenCalledWith(
      "cacheWithRedis-myFunc-foo-42"
    );
  });
});

describe("batchInvalidateCacheWithRedis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisClient.del.mockReset();
  });

  it("deletes multiple cache keys in single Redis call", async () => {
    const mockFn = vi.fn();
    Object.defineProperty(mockFn, "name", { value: "testFn" });

    mockRedisClient.del.mockResolvedValue(3);

    const batchInvalidateFn = batchInvalidateCacheWithRedis(
      mockFn,
      (arg: string) => arg
    );
    await batchInvalidateFn([["key1"], ["key2"], ["key3"]]);

    expect(mockRedisClient.del).toHaveBeenCalledWith([
      "cacheWithRedis-testFn-key1",
      "cacheWithRedis-testFn-key2",
      "cacheWithRedis-testFn-key3",
    ]);
    expect(mockRedisClient.del).toHaveBeenCalledTimes(1);
  });

  it("does nothing when argsList is empty", async () => {
    const mockFn = vi.fn();
    Object.defineProperty(mockFn, "name", { value: "testFn" });

    const batchInvalidateFn = batchInvalidateCacheWithRedis(
      mockFn,
      (arg: string) => arg
    );
    await batchInvalidateFn([]);

    expect(mockRedisClient.del).not.toHaveBeenCalled();
  });

  it("uses correct key format for all keys", async () => {
    const mockFn = vi.fn();
    Object.defineProperty(mockFn, "name", { value: "myFunc" });

    mockRedisClient.del.mockResolvedValue(2);

    const batchInvalidateFn = batchInvalidateCacheWithRedis(
      mockFn,
      (a: string, b: number) => `${a}-${b}`
    );
    await batchInvalidateFn([
      ["foo", 1],
      ["bar", 2],
    ]);

    expect(mockRedisClient.del).toHaveBeenCalledWith([
      "cacheWithRedis-myFunc-foo-1",
      "cacheWithRedis-myFunc-bar-2",
    ]);
  });
});
