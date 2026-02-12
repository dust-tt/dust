import { getRedisCacheClient } from "@app/lib/api/redis";
import { distributedLock, distributedUnlock } from "@app/lib/lock";

const SPIN_WAIT_INTERVAL_MS = 100;

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
export function cacheWithRedis<T, Args extends unknown[]>(
  fn: CacheableFunction<JsonSerializable<T>, Args>,
  resolver: KeyResolver<Args>,
  options: {
    ttlMs: number;
    redisUri?: string;
    useDistributedLock?: boolean;
    skipIfLocked?: false;
    cacheNullValues?: boolean;
  }
): (...args: Args) => Promise<JsonSerializable<T>>;

export function cacheWithRedis<T, Args extends unknown[]>(
  fn: CacheableFunction<JsonSerializable<T>, Args>,
  resolver: KeyResolver<Args>,
  options: {
    ttlMs: number;
    redisUri?: string;
    useDistributedLock: true;
    // When true and the distributed lock is taken, return null immediately.
    skipIfLocked: true;
    cacheNullValues?: boolean;
  }
): (...args: Args) => Promise<JsonSerializable<T> | null>;

export function cacheWithRedis<T, Args extends unknown[]>(
  fn: CacheableFunction<JsonSerializable<T>, Args>,
  resolver: KeyResolver<Args>,
  {
    ttlMs,
    // Kept for backwards compatibility, no longer used.
    redisUri: _redisUri,
    useDistributedLock = false,
    skipIfLocked = false,
    cacheNullValues = true,
  }: {
    ttlMs: number;
    // Kept for backwards compatibility, no longer used.
    redisUri?: string;
    useDistributedLock?: boolean;
    skipIfLocked?: boolean;
    // When false, null/undefined results are not cached. This prevents stale
    // null entries from masking records that exist in the database.
    cacheNullValues?: boolean;
  }
): (...args: Args) => Promise<JsonSerializable<T> | null> {
  if (ttlMs > 60 * 60 * 24 * 1000) {
    throw new Error("ttlMs should be less than 24 hours");
  }

  return async function (...args: Args): Promise<JsonSerializable<T> | null> {
    const key = getCacheKey(fn, resolver, args);

    const redisCli = await getRedisCacheClient({ origin: "cache_with_redis" });

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
        lockValue = await distributedLock(redisCli, key);

        if (!lockValue) {
          if (skipIfLocked) {
            return null;
          }

          // Spin-wait for the lock owner to populate the cache.
          while (!lockValue) {
            await new Promise((resolve) =>
              setTimeout(resolve, SPIN_WAIT_INTERVAL_MS)
            );
            cacheVal = await redisCli.get(key);
            if (cacheVal) {
              return JSON.parse(cacheVal) as JsonSerializable<T>;
            }
            lockValue = await distributedLock(redisCli, key);
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
      if (cacheNullValues || result != null) {
        await redisCli.set(key, JSON.stringify(result), {
          PX: ttlMs,
        });
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
  // Kept for backwards compatibility, no longer used.
  _options?: {
    redisUri?: string;
  }
): (...args: Args) => Promise<void> {
  return async function (...args: Args): Promise<void> {
    const redisCli = await getRedisCacheClient({ origin: "cache_with_redis" });

    const key = getCacheKey(fn, resolver, args);
    await redisCli.del(key);
  };
}

export function batchInvalidateCacheWithRedis<T, Args extends unknown[]>(
  fn: CacheableFunction<JsonSerializable<T>, Args>,
  resolver: KeyResolver<Args>,
  // Kept for backwards compatibility, no longer used.
  _options?: {
    redisUri?: string;
  }
): (argsList: Args[]) => Promise<void> {
  return async function (argsList: Args[]): Promise<void> {
    if (argsList.length === 0) {
      return;
    }

    const redisCli = await getRedisCacheClient({ origin: "cache_with_redis" });

    const keys = argsList.map((args) => getCacheKey(fn, resolver, args));
    await redisCli.del(keys);
  };
}

const locks: Record<string, (() => void)[]> = {};

// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
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
