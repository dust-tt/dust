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
// (needed for OTP challenge generate → validate flows).
// getRedisCacheClient uses a shared Hash-aware store so warm → fetch round-trips work.
const redisStore = new Map<string, { value: string; expiresAtMs: number }>();
const redisHashStore = new Map<string, Map<string, string>>();

function attachHashCommands(
  client: Record<string, unknown>,
  hashStore: Map<string, Map<string, string>>
) {
  const hSet = vi.fn(async (key: string, field: string, value: string) => {
    let hash = hashStore.get(key);
    if (!hash) {
      hash = new Map();
      hashStore.set(key, hash);
    }
    hash.set(field, value);
    return 1;
  });
  const hGetAll = vi.fn(async (key: string) => {
    const hash = hashStore.get(key);
    if (!hash) {
      return {};
    }
    return Object.fromEntries(hash);
  });
  const pExpire = vi.fn(async (_key: string, _ms: number) => true);

  const multi = vi.fn(() => {
    const ops: Array<() => Promise<unknown>> = [];
    const multiClient = {
      hSet: (key: string, field: string, value: string) => {
        ops.push(() => hSet(key, field, value));
        return multiClient;
      },
      hGetAll: (key: string) => {
        ops.push(() => hGetAll(key));
        return multiClient;
      },
      pExpire: (key: string, ms: number) => {
        ops.push(() => pExpire(key, ms));
        return multiClient;
      },
      exec: async () => Promise.all(ops.map((op) => op())),
    };
    return multiClient;
  });

  Object.assign(client, { hSet, hGetAll, pExpire, multi });
}

function createStatefulMockRedisClient() {
  const client: Record<string, unknown> = {
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
      redisHashStore.delete(key);
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
    exists: vi.fn(async (key: string) => {
      const entry = redisStore.get(key);
      if (!entry) {
        return 0;
      }
      if (entry.expiresAtMs > 0 && Date.now() > entry.expiresAtMs) {
        redisStore.delete(key);
        return 0;
      }
      return 1;
    }),
  };
  attachHashCommands(client, redisHashStore);
  return client;
}

const createMockRedisClient = () => {
  const client: Record<string, unknown> = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    ttl: vi.fn(),
    zAdd: vi.fn(),
    expire: vi.fn(),
    zRange: vi.fn(),
    zCount: vi.fn().mockResolvedValue(0),
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
  // Stateless clients get an isolated hash store (fresh per client instance).
  attachHashCommands(client, new Map());
  return client;
};

// runOnRedis: shared stateful client (persists across calls within a test).
const statefulRedisClient = createStatefulMockRedisClient();
// getRedisCacheClient: shared Hash-aware client so warm → fetch round-trips work.
const sharedCacheRedisClient = createStatefulMockRedisClient();

const mockRunOnRedisImpl = async (
  opts: unknown,
  fn: (
    client: ReturnType<typeof createStatefulMockRedisClient>
  ) => Promise<unknown>
) => {
  return fn(statefulRedisClient);
};

// runOnRedisCache: fresh client per call (isolated hash store).
const mockRunOnRedisCacheImpl = async (
  opts: unknown,
  fn: (client: ReturnType<typeof createMockRedisClient>) => Promise<unknown>
) => {
  const mockRedisClient = createMockRedisClient();
  return fn(mockRedisClient);
};

vi.mock("@app/lib/api/redis", () => ({
  getRedisStreamClient: vi.fn().mockResolvedValue(statefulRedisClient),
  createRedisStreamClient: vi.fn().mockResolvedValue(createMockRedisClient()),
  getRedisCacheClient: vi.fn().mockResolvedValue(sharedCacheRedisClient),
  runOnRedis: vi.fn().mockImplementation(mockRunOnRedisImpl),
  runOnRedisCache: vi.fn().mockImplementation(mockRunOnRedisCacheImpl),
  closeRedisClients: vi.fn().mockResolvedValue(undefined),
  REDIS_CACHE_CONCURRENCY: 32,
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
  warmCacheWithRedis: vi.fn().mockImplementation(() => {
    return async () => {};
  }),
  invalidateCacheWithRedis: vi.fn().mockImplementation(() => {
    return async () => {};
  }),
  bestEffortInvalidateCacheWithRedis: vi.fn().mockImplementation(() => {
    return async () => {};
  }),
  batchInvalidateCacheWithRedis: vi.fn().mockImplementation(() => {
    return async () => {};
  }),
  invalidateCacheAfterCommit: vi
    .fn()
    .mockImplementation(
      async (_transaction: unknown, invalidateFn: () => Promise<void>) => {
        await invalidateFn();
      }
    ),
}));

// Mock file storage (GCS) - must be at module level to avoid SERVICE_ACCOUNT env requirement.
vi.mock("@app/lib/file_storage", async () => {
  const { fileStorageMock } = await import(
    "@app/tests/utils/mocks/file_storage"
  );
  // Spread the actual module so plain re-exports (constants) keep their real
  // values; the mock only replaces the GCS-backed functions. Safe because the
  // real module only reads SERVICE_ACCOUNT inside the FileStorage constructor.
  const actual = await vi.importActual<typeof import("@app/lib/file_storage")>(
    "@app/lib/file_storage"
  );
  return { ...actual, ...fileStorageMock.mock() };
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

// Mock internal fetch (undici-based) so tests can intercept CoreAPI/OAuthAPI calls
// without needing real network access. Tests override with vi.mocked(internalFetch).mockImplementation(...).
vi.mock("@app/lib/api/internal_fetch", () => ({
  internalFetch: vi.fn(),
}));

// Mock Temporal - must be at module level
vi.mock("@app/lib/temporal", () => ({
  heartbeat: vi.fn().mockResolvedValue(undefined),
  getTemporalClientForAgentNamespace: vi.fn().mockResolvedValue({
    schedule: {
      getHandle: vi.fn().mockReturnValue({
        update: vi.fn(),
        delete: vi.fn(),
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
    launchDeleteWorkspaceSkillSearchWorkflow: vi.fn(async () => {
      const { Ok } = await import("@app/types/shared/result");
      return new Ok(undefined);
    }),
    launchIndexSkillSearchWorkflow: vi.fn(async () => {
      const { Ok } = await import("@app/types/shared/result");
      return new Ok(undefined);
    }),
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
  redisHashStore.clear();

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
    await c2["transaction"].rollback();
  }
  if ("namespace" in c2) {
    // @ts-expect-error - storing context in the test context
    c2["namespace"].exit(c2["context"]);
  }
  cleanup();
});
