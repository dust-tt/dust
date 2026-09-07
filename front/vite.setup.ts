import "@testing-library/jest-dom/vitest";
import "vitest-canvas-mock";

import { frontSequelize } from "@app/lib/resources/storage";
import type { CacheableFunction, JsonSerializable } from "@app/lib/utils/cache";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { redisMock } from "@app/tests/utils/mocks/redis";
import { createNamespace } from "@app/tests/utils/test_cls";
import type { Result } from "@app/types/shared/result";
import { cleanup } from "@testing-library/react";
import { Sequelize } from "sequelize";
import { afterEach, beforeEach, vi } from "vitest";

// Mock Redis - must be at module level.
vi.mock("@app/lib/api/redis", async () => {
  const { redisMock } = await import("@app/tests/utils/mocks/redis");
  return redisMock.mock();
});

vi.mock("@app/lib/utils/cache", () => ({
  buildCacheWithRedisKey: (cacheId: string, resolverKey: string) =>
    `cacheWithRedis-${cacheId}-${resolverKey}`,
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
  cacheWithRedisResult: vi
    .fn()
    .mockImplementation(
      <T, E, Args extends unknown[]>(
        fn: (...args: Args) => Promise<Result<JsonSerializable<T>, E>>
      ): ((...args: Args) => Promise<Result<JsonSerializable<T>, E>>) => {
        return async function (
          ...args: Args
        ): Promise<Result<JsonSerializable<T>, E>> {
          return fn(...args);
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
vi.mock("@app/lib/api/internal_fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/api/internal_fetch")>()),
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
    launchIndexUserSearchWorkflow: vi.fn(async () => {
      const { Ok } = await import("@app/types/shared/result");
      return new Ok(undefined);
    }),
  };
});

beforeEach(async (c) => {
  vi.clearAllMocks();
  fileStorageMock.reset();
  redisMock.reset();

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
