import "@testing-library/jest-dom/vitest";
import "vitest-canvas-mock";

import { frontSequelize } from "@app/lib/resources/storage";
import type { CacheableFunction, JsonSerializable } from "@app/lib/utils/cache";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { createNamespace } from "@app/tests/utils/test_cls";
import { cleanup } from "@testing-library/react";
import { Sequelize } from "sequelize";
import { afterEach, beforeEach, vi } from "vitest";

// Mock Redis - must be at module level.
// runOnRedis uses a shared in-memory store so that set/get/del/ttl persist across calls
// (needed for OTP challenge generate → validate flows). runOnRedisCache stays stateless.
const redisStore = new Map<string, { value: string; expiresAtMs: number }>();

function createStatefulMockRedisClient() {
  return {
    get: vi.fn(async (key: string) => {
      const entry = redisStore.get(key);
      if (!entry) {
        return null;
      }
      if (entry.expiresAtMs > 0 && Date.now() > entry.expiresAtMs) {
        redisStore.delete(key);
        return null;
      }
      return entry.value;
    }),
    set: vi.fn(async (key: string, value: string, opts?: { EX?: number }) => {
      const expiresAtMs = opts?.EX ? Date.now() + opts.EX * 1000 : 0;
      redisStore.set(key, { value, expiresAtMs });
    }),
    del: vi.fn(async (key: string) => {
      redisStore.delete(key);
    }),
    ttl: vi.fn(async (key: string) => {
      const entry = redisStore.get(key);
      if (!entry || entry.expiresAtMs === 0) {
        return -1;
      }
      const remainingMs = entry.expiresAtMs - Date.now();
      return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : -2;
    }),
    zAdd: vi.fn(),
    expire: vi.fn(),
    zRange: vi.fn(),
    zCount: vi.fn().mockResolvedValue(0),
    hGetAll: vi.fn().mockResolvedValue([]),
    hGet: vi.fn(),
    quit: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    xAdd: vi.fn().mockResolvedValue("0-0"),
    xRead: vi.fn().mockResolvedValue(null),
    xDel: vi.fn().mockResolvedValue(1),
    publish: vi.fn().mockResolvedValue(1),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    ping: vi.fn().mockResolvedValue("PONG"),
    eval: vi.fn().mockResolvedValue(1),
  };
}

const createMockRedisClient = () => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  ttl: vi.fn(),
  zAdd: vi.fn(),
  expire: vi.fn(),
  zRange: vi.fn(),
  zCount: vi.fn().mockResolvedValue(0),
  hGetAll: vi.fn().mockResolvedValue([]),
  hGet: vi.fn(),
  quit: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  xAdd: vi.fn().mockResolvedValue("0-0"),
  xRead: vi.fn().mockResolvedValue(null),
  xDel: vi.fn().mockResolvedValue(1),
  publish: vi.fn().mockResolvedValue(1),
  subscribe: vi.fn().mockResolvedValue(undefined),
  unsubscribe: vi.fn().mockResolvedValue(undefined),
  ping: vi.fn().mockResolvedValue("PONG"),
  eval: vi.fn().mockResolvedValue(1),
});

// runOnRedis: shared stateful client (persists across calls within a test).
const statefulRedisClient = createStatefulMockRedisClient();
const mockRunOnRedisImpl = async (
  opts: unknown,
  fn: (
    client: ReturnType<typeof createStatefulMockRedisClient>
  ) => Promise<unknown>
) => {
  return fn(statefulRedisClient);
};

// runOnRedisCache: stateless (fresh client per call).
const mockRunOnRedisCacheImpl = async (
  opts: unknown,
  fn: (client: ReturnType<typeof createMockRedisClient>) => Promise<unknown>
) => {
  const mockRedisClient = createMockRedisClient();
  return fn(mockRedisClient);
};

vi.mock("@app/lib/api/redis", () => ({
  getRedisStreamClient: vi
    .fn()
    .mockResolvedValue(createStatefulMockRedisClient()),
  createRedisStreamClient: vi.fn().mockResolvedValue(createMockRedisClient()),
  getRedisCacheClient: vi.fn().mockResolvedValue(createMockRedisClient()),
  runOnRedis: vi.fn().mockImplementation(mockRunOnRedisImpl),
  runOnRedisCache: vi.fn().mockImplementation(mockRunOnRedisCacheImpl),
  closeRedisClients: vi.fn().mockResolvedValue(undefined),
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
  batchInvalidateCacheWithRedis: vi.fn().mockImplementation(() => {
    return async () => {};
  }),
  invalidateCacheAfterCommit: vi
    .fn()
    .mockImplementation(
      (_transaction: unknown, invalidateFn: () => Promise<void>) => {
        invalidateFn();
      }
    ),
}));

// Mock file storage (GCS) - must be at module level to avoid SERVICE_ACCOUNT env requirement.
vi.mock("@app/lib/file_storage", async () => {
  const { fileStorageMock } = await import(
    "@app/tests/utils/mocks/file_storage"
  );
  return fileStorageMock.mock();
});

// Mock TextExtraction (Tika) - must be at module level to avoid connecting to Tika.
vi.mock("@app/types/shared/text_extraction", async () => {
  const { mockTextExtraction } = await import(
    "@app/tests/utils/mocks/text_extraction"
  );
  return mockTextExtraction();
});

// Mock sandbox provider - must be at module level
vi.mock("@app/lib/api/sandbox", () => ({
  getSandboxProvider: vi.fn().mockReturnValue(undefined),
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
      const { Ok } = await import("@app/types/shared/result");
      return new Ok(undefined);
    }),
  };
});

beforeEach(async (c) => {
  vi.clearAllMocks();
  fileStorageMock.reset();
  redisStore.clear();

  const namespace = createNamespace("test-namespace");

  // We use CLS to create a namespace and a transaction to isolate each test.
  // See https://github.com/sequelize/sequelize/issues/11408#issuecomment-563962996
  // And https://sequelize.org/docs/v6/other-topics/transactions/#automatically-pass-transactions-to-all-queries
  Sequelize.useCLS(namespace);
  const context = namespace.createContext();
  namespace.enter(context);
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
});

afterEach(async (c2) => {
  if ("transaction" in c2) {
    // @ts-expect-error - storing context in the test context
    c2["transaction"].rollback();
  }
  if ("namespace" in c2) {
    // @ts-expect-error - storing context in the test context
    c2["namespace"].exit(c2["context"]);
  }
  cleanup();
});
