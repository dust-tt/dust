import { getRedisClient } from "@app/lib/api/redis";
import { distributedLock, distributedUnlock } from "@app/lib/lock";

// JSON-serializable primitive types.
type JsonPrimitive = string | number | boolean | null;

// Recursive type to check if a type is JSON-serializable.
type RecursiveJsonSerializable<T> = T extends JsonPrimitive | []
  ? T
  : T extends Array<infer U>
    ? RecursiveJsonSerializable<U>[]
    : T extends object
      ? { [K in keyof T]: RecursiveJsonSerializable<T[K]> }
      : never;

// Helper type to check if a type is 'never'.
type IsNever<T> = [T] extends [never] ? true : false;

/**
 * Ensures that a type is strictly JSON-serializable.
 * If T is not JSON-serializable, this type resolves to 'never'.
 */
export type JsonSerializable<T> =
  IsNever<Exclude<RecursiveJsonSerializable<T>, T>> extends true ? T : never;

export type CacheableFunction<T, Args extends unknown[]> = (
  ...args: Args
) => Promise<T>;

type KeyResolver<Args extends unknown[]> = (...args: Args) => string;

function getCacheKey<T, Args extends unknown[]>(
  fn: CacheableFunction<JsonSerializable<T>, Args>,
  resolver: KeyResolver<Args>,
  args: Args
) {
  return `cacheWithRedis-${fn.name}-${resolver(...args)}`;
}

// Wrapper function to cache the result of a function with Redis.
// Usage:
// const cachedFn = cacheWithRedis(fn, (fnArg1, fnArg2, ...) => `${fnArg1}-${fnArg2}`, 60 * 10 * 1000);

// if caching big objects, there is a possible race condition (multiple calls to
// caching), therefore, we use a lock
const DISTRIBUTED_LOCK_SPIN_WAIT_MS = 20;

export function cacheWithRedis<T, Args extends unknown[]>(
  fn: CacheableFunction<JsonSerializable<T>, Args>,
  resolver: KeyResolver<Args>,
  {
    ttlMs,
    staleTtlMs,
    redisUri,
    useDistributedLock = false,
  }: {
    ttlMs: number;
    // When set, the cached value is kept in Redis for staleTtlMs (must be > ttlMs).
    // After ttlMs, the value is considered stale: one request acquires the lock to
    // refresh while others immediately return the stale value instead of spin-waiting.
    staleTtlMs?: number;
    redisUri?: string;
    useDistributedLock?: boolean;
  }
): (...args: Args) => Promise<JsonSerializable<T>> {
  if (ttlMs > 60 * 60 * 24 * 1000) {
    throw new Error("ttlMs should be less than 24 hours");
  }
  if (staleTtlMs !== undefined && staleTtlMs <= ttlMs) {
    throw new Error("staleTtlMs must be greater than ttlMs");
  }

  // When using stale-while-revalidate, we store the value with the longer staleTtlMs
  // and use a separate "fresh:<key>" marker with ttlMs to track freshness.
  const storageTtlMs = staleTtlMs ?? ttlMs;

  return async function (...args: Args): Promise<JsonSerializable<T>> {
    if (!redisUri) {
      const REDIS_CACHE_URI = process.env.REDIS_CACHE_URI;
      if (!REDIS_CACHE_URI) {
        throw new Error("REDIS_CACHE_URI is not set");
      }
      redisUri = REDIS_CACHE_URI;
    }

    const key = getCacheKey(fn, resolver, args);
    const freshKey = staleTtlMs ? `fresh:${key}` : undefined;

    const redisCli = await getRedisClient({ origin: "cache_with_redis" });

    let cacheVal = await redisCli.get(key);
    if (cacheVal) {
      // If using stale-while-revalidate, check freshness.
      if (freshKey) {
        const isFresh = await redisCli.get(freshKey);
        if (!isFresh) {
          // Value is stale — try to acquire lock for background refresh.
          // If lock fails, another request is already refreshing: return stale.
          const lockValue = useDistributedLock
            ? await distributedLock(redisCli, key)
            : undefined;
          if (lockValue) {
            // We got the lock — refresh in background and return stale now.
            void (async () => {
              try {
                const result = await fn(...args);
                const serialized = JSON.stringify(result);
                await redisCli.set(key, serialized, { PX: storageTtlMs });
                await redisCli.set(freshKey, "1", { PX: ttlMs });
              } finally {
                await distributedUnlock(redisCli, key, lockValue);
              }
            })();
          }
          // Return stale value immediately.
        }
      }
      return JSON.parse(cacheVal) as JsonSerializable<T>;
    }

    // No cached value at all — must compute synchronously.
    // specific try-finally to ensure unlock is called only after lock
    let lockValue: string | undefined;
    try {
      // if value not found, lock, recheck and set
      // we avoid locking for the first read to allow parallel calls to redis if the value is set
      if (useDistributedLock) {
        while (!lockValue) {
          lockValue = await distributedLock(redisCli, key);

          if (!lockValue) {
            // If lock is not acquired, wait and retry.
            await new Promise((resolve) =>
              setTimeout(resolve, DISTRIBUTED_LOCK_SPIN_WAIT_MS)
            );
            // Check first if value was set while we were waiting.
            // Most likely, the value will be set by the lock owner when it's done.
            cacheVal = await redisCli.get(key);
            if (cacheVal) {
              return JSON.parse(cacheVal) as JsonSerializable<T>;
            }
          }
        }
      } else {
        await lock(key);
      }
      cacheVal = await redisCli.get(key);
      if (cacheVal) {
        return JSON.parse(cacheVal) as JsonSerializable<T>;
      }

      const result = await fn(...args);
      const serialized = JSON.stringify(result);
      await redisCli.set(key, serialized, { PX: storageTtlMs });
      if (freshKey) {
        await redisCli.set(freshKey, "1", { PX: ttlMs });
      }
      return result;
    } finally {
      if (useDistributedLock) {
        if (lockValue) {
          await distributedUnlock(redisCli, key, lockValue);
        }
      } else {
        unlock(key);
      }
    }
  };
}

export function invalidateCacheWithRedis<T, Args extends unknown[]>(
  fn: CacheableFunction<JsonSerializable<T>, Args>,
  resolver: KeyResolver<Args>,
  options?: {
    redisUri?: string;
  }
): (...args: Args) => Promise<void> {
  return async function (...args: Args): Promise<void> {
    let redisUri: string | undefined = options?.redisUri;
    if (!redisUri) {
      const REDIS_CACHE_URI = process.env.REDIS_CACHE_URI;
      if (!REDIS_CACHE_URI) {
        throw new Error("REDIS_CACHE_URI is not set");
      }
      redisUri = REDIS_CACHE_URI;
    }
    const redisCli = await getRedisClient({ origin: "cache_with_redis" });

    const key = getCacheKey(fn, resolver, args);
    await redisCli.del([key, `fresh:${key}`]);
  };
}

export function batchInvalidateCacheWithRedis<T, Args extends unknown[]>(
  fn: CacheableFunction<JsonSerializable<T>, Args>,
  resolver: KeyResolver<Args>,
  options?: {
    redisUri?: string;
  }
): (argsList: Args[]) => Promise<void> {
  return async function (argsList: Args[]): Promise<void> {
    if (argsList.length === 0) {
      return;
    }

    let redisUri: string | undefined = options?.redisUri;
    if (!redisUri) {
      const REDIS_CACHE_URI = process.env.REDIS_CACHE_URI;
      if (!REDIS_CACHE_URI) {
        throw new Error("REDIS_CACHE_URI is not set");
      }
      redisUri = REDIS_CACHE_URI;
    }
    const redisCli = await getRedisClient({ origin: "cache_with_redis" });

    const keys = argsList.flatMap((args) => {
      const key = getCacheKey(fn, resolver, args);
      return [key, `fresh:${key}`];
    });
    await redisCli.del(keys);
  };
}

const locks: Record<string, (() => void)[]> = {};

async function lock(key: string) {
  return new Promise<void>((resolve) => {
    if (locks[key]) {
      locks[key].push(resolve);
    } else {
      // use array to allow multiple locks
      // array set to empty indicates first lock
      locks[key] = [];
      resolve();
    }
  });
}

function unlock(key: string) {
  if (locks[key] === undefined) {
    throw new Error("Unreachable: unlock called without lock");
  }

  if (locks[key].length === 0) {
    delete locks[key];
    return;
  }

  const unlockFn = locks[key].pop();
  if (!unlockFn) {
    throw new Error("Unreachable: unlock called without lock");
  }
  unlockFn();
}
