import "@testing-library/jest-dom/vitest";
import "vitest-canvas-mock";

import { cleanup } from "@testing-library/react";
import { default as cls } from "cls-hooked";
import { Sequelize } from "sequelize";
import { afterEach, beforeEach, vi } from "vitest";

import { frontSequelize } from "@app/lib/resources/storage";

beforeEach(async (c) => {
  vi.clearAllMocks();

  // Mock Redis
  vi.mock("@app/lib/api/redis", () => ({
    getRedisClient: vi.fn().mockResolvedValue({
      get: vi.fn(),
      set: vi.fn(),
      ttl: vi.fn(),
      zAdd: vi.fn(),
      expire: vi.fn(),
      zRange: vi.fn(),
      hGetAll: vi.fn().mockResolvedValue([]),
    }),
    runOnRedis: vi
      .fn()
      .mockImplementation(
        async (opts: unknown, fn: (client: any) => Promise<unknown>) => {
          // Mock Redis client
          const mockRedisClient = {
            get: vi.fn(),
            set: vi.fn(),
            ttl: vi.fn(),
            zAdd: vi.fn(),
            expire: vi.fn(),
            zRange: vi.fn(),
            hGetAll: vi.fn().mockResolvedValue([]),
          };

          return fn(mockRedisClient);
        }
      ),
  }));

  // Mock Temporal
  vi.mock("@app/lib/temporal", () => ({
    getTemporalClientForAgentNamespace: vi.fn().mockResolvedValue({
      schedule: {
        getHandle: vi.fn().mockReturnValue({
          update: vi.fn(),
        }),
      },
    }),
  }));
  const namespace = cls.createNamespace("test-namespace");

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
  // @ts-expect-error - storing context in the test context
  c2["transaction"].rollback();
  // @ts-expect-error - storing context in the test context
  c2["namespace"].exit(c2["context"]);
  cleanup();
});
