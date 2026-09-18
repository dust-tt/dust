import { vi } from "vitest";

/**
 * Mock for @app/lib/api/redis. Globally registered in vite.setup.ts.
 *
 * Strings and hashes are held in memory so round-trips work within a test: `set`/`get`/`del`/`ttl`
 * for the OTP challenge flows, `hSet`/`hSetNX`/`hmGet`/`hGetAll`/`hIncrBy`/`hDel`/`expire`/`type`
 * for the caches and counters that key a hash per workspace. `getRedisCacheClient` and
 * `runOnRedisCache` hand back the same client, as they do in production. Call `reset()` between
 * tests to clear both stores.
 *
 * Usage in tests:
 *   import { redisMock } from "@app/tests/utils/mocks/redis";
 *   const client = redisMock.cacheClient;
 */
class RedisMock {
  private readonly stringStore = new Map<
    string,
    { value: string; expiresAtMs: number }
  >();
  private readonly hashStore = new Map<string, Map<string, string>>();

  // runOnRedis / getRedisStreamClient: one shared client, state persists across calls.
  readonly streamClient = this.createStatefulClient(this.hashStore);
  // getRedisCacheClient / runOnRedisCache: one shared client, as in production.
  readonly cacheClient = this.createStatefulClient(this.hashStore);

  reset(): void {
    this.stringStore.clear();
    this.hashStore.clear();
  }

  // Clients that never need to observe their own writes get an isolated hash store.
  createStatelessClient() {
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
    return Object.assign(client, this.hashCommands(new Map()));
  }

  mock() {
    return {
      getRedisStreamClient: vi.fn().mockResolvedValue(this.streamClient),
      createRedisStreamClient: vi
        .fn()
        .mockResolvedValue(this.createStatelessClient()),
      getRedisCacheClient: vi.fn().mockResolvedValue(this.cacheClient),
      runOnRedis: vi
        .fn()
        .mockImplementation(
          async (_opts: unknown, fn: (client: unknown) => Promise<unknown>) =>
            fn(this.streamClient)
        ),
      runOnRedisCache: vi
        .fn()
        .mockImplementation(
          async (_opts: unknown, fn: (client: unknown) => Promise<unknown>) =>
            fn(this.cacheClient)
        ),
      closeRedisClients: vi.fn().mockResolvedValue(undefined),
      REDIS_CACHE_CONCURRENCY: 32,
    };
  }

  private createStatefulClient(hashStore: Map<string, Map<string, string>>) {
    const client: Record<string, unknown> = {
      get: vi.fn(async (key: string) => {
        const entry = this.stringStore.get(key);
        if (!entry) {
          return null;
        }
        if (entry.expiresAtMs > 0 && Date.now() > entry.expiresAtMs) {
          this.stringStore.delete(key);
          return null;
        }
        return entry.value;
      }),
      set: vi.fn(
        async (
          key: string,
          value: string,
          opts?: { EX?: number; NX?: boolean; PX?: number }
        ) => {
          const existing = this.stringStore.get(key);
          if (
            opts?.NX &&
            existing &&
            (existing.expiresAtMs === 0 || existing.expiresAtMs > Date.now())
          ) {
            return null;
          }
          const expiresAtMs = opts?.EX
            ? Date.now() + opts.EX * 1000
            : opts?.PX
              ? Date.now() + opts.PX
              : 0;
          this.stringStore.set(key, { value, expiresAtMs });
          return "OK";
        }
      ),
      del: vi.fn(async (keyOrKeys: string | string[]) => {
        const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
        let deleted = 0;
        for (const key of keys) {
          if (this.stringStore.delete(key)) {
            deleted += 1;
          }
          if (hashStore.delete(key)) {
            deleted += 1;
          }
        }
        return deleted;
      }),
      ttl: vi.fn(async (key: string) => {
        const entry = this.stringStore.get(key);
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
      eval: vi.fn(
        async (
          script: string,
          { keys, arguments: args }: { keys: string[]; arguments: string[] }
        ) => {
          if (!script.includes('redis.call("del", KEYS[1])')) {
            return 1;
          }
          const [key] = keys;
          const [expectedValue] = args;
          if (key && this.stringStore.get(key)?.value === expectedValue) {
            this.stringStore.delete(key);
            return 1;
          }
          return 0;
        }
      ),
      exists: vi.fn(async (key: string) => {
        const entry = this.stringStore.get(key);
        if (!entry) {
          return 0;
        }
        if (entry.expiresAtMs > 0 && Date.now() > entry.expiresAtMs) {
          this.stringStore.delete(key);
          return 0;
        }
        return 1;
      }),
    };
    return Object.assign(client, this.hashCommands(hashStore));
  }

  // Returned rather than assigned in place so the client type carries them:
  // tests can call `redisMock.cacheClient.hGetAll(key)` without a cast.
  private hashCommands(hashStore: Map<string, Map<string, string>>) {
    const hashFor = (key: string) => {
      let hash = hashStore.get(key);
      if (!hash) {
        hash = new Map();
        hashStore.set(key, hash);
      }
      return hash;
    };

    // Mirrors node-redis: hSet takes either (key, field, value) or (key, fieldsObject).
    const hSet = vi.fn(
      async (
        key: string,
        fieldOrFields: string | Record<string, string>,
        value?: string
      ) => {
        const hash = hashFor(key);
        if (typeof fieldOrFields === "string") {
          hash.set(fieldOrFields, value ?? "");
          return 1;
        }
        for (const [field, fieldValue] of Object.entries(fieldOrFields)) {
          hash.set(field, fieldValue);
        }
        return Object.keys(fieldOrFields).length;
      }
    );
    const hSetNX = vi.fn(async (key: string, field: string, value: string) => {
      const hash = hashFor(key);
      if (hash.has(field)) {
        return 0;
      }
      hash.set(field, value);
      return 1;
    });
    const hGetAll = vi.fn(async (key: string) => {
      const hash = hashStore.get(key);

      return hash ? Object.fromEntries(hash) : {};
    });
    const hmGet = vi.fn(async (key: string, fields: string[]) => {
      const hash = hashStore.get(key);

      return fields.map((field) => hash?.get(field) ?? null);
    });
    const hDel = vi.fn(async (key: string, fields: string | string[]) => {
      const hash = hashStore.get(key);
      if (!hash) {
        return 0;
      }
      const toDelete = Array.isArray(fields) ? fields : [fields];

      return toDelete.filter((field) => hash.delete(field)).length;
    });
    const pExpire = vi.fn(async (_key: string, _ms: number) => true);
    const hIncrBy = vi.fn(
      async (key: string, field: string, increment: number) => {
        const hash = hashFor(key);
        const next = Number(hash.get(field) ?? "0") + increment;
        hash.set(field, String(next));
        return next;
      }
    );

    // Hash TTLs are not enforced; the call is recorded on the spy so tests can
    // assert that counter keys were given one.
    const expire = vi.fn(async (key: string, _seconds: number) =>
      hashStore.has(key) || this.stringStore.has(key) ? 1 : 0
    );

    const type = vi.fn(async (key: string) => {
      if (hashStore.has(key)) {
        return "hash";
      }
      return this.stringStore.has(key) ? "string" : "none";
    });

    const multi = vi.fn(() => {
      const ops: Array<() => Promise<unknown>> = [];
      const multiClient = {
        del: (key: string) => {
          ops.push(async () => {
            this.stringStore.delete(key);
            hashStore.delete(key);
          });
          return multiClient;
        },
        hSet: (
          key: string,
          fieldOrFields: string | Record<string, string>,
          value?: string
        ) => {
          ops.push(() => hSet(key, fieldOrFields, value));
          return multiClient;
        },
        hSetNX: (key: string, field: string, value: string) => {
          ops.push(() => hSetNX(key, field, value));
          return multiClient;
        },
        hDel: (key: string, fields: string | string[]) => {
          ops.push(() => hDel(key, fields));
          return multiClient;
        },
        hGetAll: (key: string) => {
          ops.push(() => hGetAll(key));
          return multiClient;
        },
        hIncrBy: (key: string, field: string, increment: number) => {
          ops.push(() => hIncrBy(key, field, increment));
          return multiClient;
        },
        expire: (key: string, seconds: number) => {
          ops.push(() => expire(key, seconds));
          return multiClient;
        },
        pExpire: (key: string, ms: number) => {
          ops.push(() => pExpire(key, ms));
          return multiClient;
        },
        exec: async () => {
          const results: unknown[] = [];
          for (const op of ops) {
            results.push(await op());
          }
          return results;
        },
      };
      return multiClient;
    });

    return {
      hSet,
      hSetNX,
      hGetAll,
      hIncrBy,
      hmGet,
      hDel,
      expire,
      pExpire,
      type,
      multi,
    };
  }
}

export const redisMock = new RedisMock();
