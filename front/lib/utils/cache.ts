import { getRedisClient } from "@app/lib/api/redis";
import { distributedLock, distributedUnlock } from "@app/lib/lock";

// JSON-serializable primitive types.
type JsonPrimitive = string | number | boolean | null;

// Recursive type to check if a type is JSON-serializable.
type RecursiveJsonSerializable<T> = T extends JsonPrimitive
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

type CacheableFunction<T, Args extends unknown[]> = (
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any

// if caching big objects, there is a possible race condition (multiple calls to
// caching), therefore, we use a lock
export function cacheWithRedis<T, Args extends unknown[]>(
  fn: CacheableFunction<JsonSerializable<T>, Args>,
  resolver: KeyResolver<Args>,
  {
    ttlMs,
    redisUri,
    useDistributedLock = false,
  }: {
    ttlMs: number;
    redisUri?: string;
    useDistributedLock?: boolean;
  }
): (...args: Args) => Promise<JsonSerializable<T>> {
  if (ttlMs > 60 * 60 * 24 * 1000) {
    throw new Error("ttlMs should be less than 24 hours");
  }

  return async function (...args: Args): Promise<JsonSerializable<T>> {
    if (!redisUri) {
      const REDIS_CACHE_URI = process.env.REDIS_CACHE_URI;
      if (!REDIS_CACHE_URI) {
        throw new Error("REDIS_CACHE_URI is not set");
      }
      redisUri = REDIS_CACHE_URI;
    }

    const key = getCacheKey(fn, resolver, args);

    const redisCli = await getRedisClient({ origin: "cache_with_redis" });

    let cacheVal = await redisCli.get(key);
    if (cacheVal) {
      return JSON.parse(cacheVal) as JsonSerializable<T>;
    }

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
            await new Promise((resolve) => setTimeout(resolve, 100));
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
      await redisCli.set(key, JSON.stringify(result), {
        PX: ttlMs,
      });
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
    await redisCli.del(key);
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

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
