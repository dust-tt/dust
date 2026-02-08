import "@testing-library/jest-dom/vitest";
import "vitest-canvas-mock";

import { cleanup } from "@testing-library/react";
import { default as cls } from "cls-hooked";
import { Sequelize } from "sequelize";
import { afterEach, beforeEach, vi } from "vitest";

import { frontSequelize } from "@app/lib/resources/storage";
import type { CacheableFunction, JsonSerializable } from "@app/lib/utils/cache";

// Mock Redis - must be at module level
vi.mock("@app/lib/api/redis", () => ({
  getRedisClient: vi.fn().mockResolvedValue({
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    ttl: vi.fn(),
    zAdd: vi.fn(),
    expire: vi.fn(),
    zRange: vi.fn(),
    hGetAll: vi.fn().mockResolvedValue([]),
    hGet: vi.fn(),
  }),
  runOnRedis: vi
    .fn()
    .mockImplementation(
      async (opts: unknown, fn: (client: any) => Promise<unknown>) => {
        // Mock Redis client
        const mockRedisClient = {
          get: vi.fn(),
          set: vi.fn(),
          del: vi.fn(),
          ttl: vi.fn(),
          zAdd: vi.fn(),
          expire: vi.fn(),
          zRange: vi.fn(),
          hGetAll: vi.fn().mockResolvedValue([]),
          hGet: vi.fn(),
        };

        return fn(mockRedisClient);
      }
    ),
}));

vi.mock("@app/lib/utils/cache", () => ({
  cacheWithRedis: vi
    .fn()
    .mockImplementation(
      <T, Args extends unknown[]>(
        fn: CacheableFunction<JsonSerializable<T>, Args>
      ): ((...args: Args) => Promise<JsonSerializable<T>>) => {
        return async function (...args: Args): Promise<JsonSerializable<T>> {
          const result = await fn(...args);
          return result;
        };
      }
    ),
  invalidateCacheWithRedis: vi.fn().mockImplementation(() => {
    return async () => {};
  }),
}));

// Mock Temporal - must be at module level
vi.mock("@app/lib/temporal", () => ({
  getTemporalClientForAgentNamespace: vi.fn().mockResolvedValue({
    schedule: {
      getHandle: vi.fn().mockReturnValue({
        update: vi.fn(),
      }),
    },
  }),
  getTemporalClientForFrontNamespace: vi.fn().mockResolvedValue({
    workflow: {
      start: vi.fn().mockResolvedValue(undefined),
    },
  }),
}));

// Mock Temporal indexation workflow - must be at module level
vi.mock("@app/temporal/es_indexation/client", async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  return {
    ...mod,
    launchIndexUserSearchWorkflow: vi.fn(async () => {
      const { Ok } = await import("@app/types");
      return new Ok(undefined);
    }),
  };
});

beforeEach(async (c) => {
  vi.clearAllMocks();

  // Use unique namespace name to prevent collisions between concurrent tests
  const namespaceName = `test-namespace-${Date.now()}-${Math.random()}`;
  const namespace = cls.createNamespace(namespaceName);

  // We use CLS to create a namespace and a transaction to isolate each test.
  // See https://github.com/sequelize/sequelize/issues/11408#issuecomment-563962996
  // And https://sequelize.org/docs/v6/other-topics/transactions/#automatically-pass-transactions-to-all-queries
  Sequelize.useCLS(namespace);
  const context = namespace.createContext();
  namespace.enter(context);

  try {
    const transaction = await frontSequelize.transaction({
      autocommit: false,
    });
    namespace.set("transaction", transaction);

    // @ts-expect-error - storing context in the test context
    c["namespace"] = namespace;
    // @ts-expect-error - storing context in the test context
    c["context"] = context;
    // @ts-expect-error - storing context in the test context
    c["transaction"] = transaction;
  } catch (error) {
    // If transaction creation fails, clean up the namespace
    namespace.exit(context);
    cls.destroyNamespace(namespaceName);
    throw error;
  }
});

afterEach(async (c2) => {
  try {
    // @ts-expect-error - storing context in the test context
    const transaction = c2["transaction"];
    if (transaction) {
      await transaction.rollback();
    }
  } catch (error) {
    console.error("Error rolling back transaction:", error);
  } finally {
    // @ts-expect-error - storing context in the test context
    const namespace = c2["namespace"];
    // @ts-expect-error - storing context in the test context
    const context = c2["context"];
    if (namespace && context) {
      namespace.exit(context);
      // Destroy the namespace to free resources and prevent memory leaks
      cls.destroyNamespace(namespace.name);
    }
    cleanup();
  }
});
