import { getRedisCacheClient } from "@app/lib/api/redis";
import { distributedLock, distributedUnlock } from "@app/lib/lock";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Transaction } from "sequelize";

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

// `readFrom` chooses the key used for reads. Fresh loads write both keys.
// `after_read` also copies cache hits to the other key.
type CacheKeyMigration<Args extends unknown[]> = {
  previousKey: {
    cacheId: string;
    resolver: KeyResolver<Args>;
  };
  readFrom: "previous" | "new";
  copyToOtherKey: "after_load" | "after_read";
};

export function buildCacheWithRedisKey(
  cacheId: string,
  resolverKey: string
): string {
  return `cacheWithRedis-${cacheId}-${resolverKey}`;
}

function getCacheKey<T, Args extends unknown[]>(
  fn: CacheableFunction<T, Args>,
  resolver: KeyResolver<Args>,
  args: Args,
  cacheId: string = fn.name
) {
  return buildCacheWithRedisKey(cacheId, resolver(...args));
}

// Wrapper function to cache the result of a function with Redis.
// Usage:
// const cachedFn = cacheWithRedis(fn, (fnArg1, fnArg2, ...) => `${fnArg1}-${fnArg2}`, 60 * 10 * 1000)

// if caching big objects, there is a possible race condition (multiple calls to
// caching), therefore, we use a lock
export function cacheWithRedis<T, Args extends unknown[]>(
  fn: CacheableFunction<JsonSerializable<T>, Args>,
  resolver: KeyResolver<Args>,
  options: {
    cacheId?: string;
    ttlMs?: number | ((...args: Args) => number);
    redisUri?: string;
    useDistributedLock?: boolean;
    skipIfLocked?: false;
    cacheNullValues?: boolean;
    migration?: CacheKeyMigration<Args>;
  }
): (...args: Args) => Promise<JsonSerializable<T>>;

export function cacheWithRedis<T, Args extends unknown[]>(
  fn: CacheableFunction<JsonSerializable<T> | null, Args>,
  resolver: KeyResolver<Args>,
  options: {
    cacheId?: string;
    ttlMs?: number | ((...args: Args) => number);
    redisUri?: string;
    useDistributedLock?: boolean;
    skipIfLocked?: false;
    cacheNullValues: false;
    migration?: CacheKeyMigration<Args>;
  }
): (...args: Args) => Promise<JsonSerializable<T> | null>;

export function cacheWithRedis<T, Args extends unknown[]>(
  fn: CacheableFunction<JsonSerializable<T>, Args>,
  resolver: KeyResolver<Args>,
  options: {
    cacheId?: string;
    ttlMs?: number | ((...args: Args) => number);
    redisUri?: string;
    useDistributedLock: true;
    // When true and the distributed lock is taken, return null immediately.
    skipIfLocked: true;
    cacheNullValues?: boolean;
    migration?: CacheKeyMigration<Args>;
  }
): (...args: Args) => Promise<JsonSerializable<T> | null>;

export function cacheWithRedis<T, Args extends unknown[]>(
  fn: CacheableFunction<JsonSerializable<T> | null, Args>,
  resolver: KeyResolver<Args>,
  {
    cacheId,
    ttlMs,
    // Kept for backwards compatibility, no longer used.
    redisUri: _redisUri,
    useDistributedLock = false,
    skipIfLocked = false,
    cacheNullValues = true,
    migration,
  }: {
    cacheId?: string;
    ttlMs?: number | ((...args: Args) => number);
    // Kept for backwards compatibility, no longer used.
    redisUri?: string;
    useDistributedLock?: boolean;
    skipIfLocked?: boolean;
    // When false, null/undefined results are not cached. This prevents stale
    // null entries from masking records that exist in the database.
    cacheNullValues?: boolean;
    migration?: CacheKeyMigration<Args>;
  }
): (...args: Args) => Promise<JsonSerializable<T> | null> {
  // A static ttlMs is validated eagerly, same as before. A function ttlMs can only be
  // validated once the args are known, so that case is checked per-call below instead.
  if (typeof ttlMs === "number" && ttlMs > 60 * 60 * 24 * 1000) {
    throw new Error("ttlMs should be less than 24 hours");
  }

  return async function (...args: Args): Promise<JsonSerializable<T> | null> {
    const resolvedTtlMs = typeof ttlMs === "function" ? ttlMs(...args) : ttlMs;
    if (resolvedTtlMs !== undefined && resolvedTtlMs > 60 * 60 * 24 * 1000) {
      throw new Error("ttlMs should be less than 24 hours");
    }

    const newKey = getCacheKey(fn, resolver, args, cacheId);
    const previousKey = migration
      ? getCacheKey(
          fn,
          migration.previousKey.resolver,
          args,
          migration.previousKey.cacheId
        )
      : null;
    const readKey =
      migration?.readFrom === "previous" && previousKey ? previousKey : newKey;
    const otherKey = previousKey
      ? readKey === newKey
        ? previousKey
        : newKey
      : null;

    const redisCli = await getRedisCacheClient({ origin: "cache_with_redis" });

    const setValue = async (keyToSet: string, value: string): Promise<void> => {
      if (resolvedTtlMs !== undefined) {
        await redisCli.set(keyToSet, value, { PX: resolvedTtlMs });
      } else {
        await redisCli.set(keyToSet, value);
      }
    };

    const copyToOtherKey = async (
      value: string,
      { fromCacheHit }: { fromCacheHit: boolean }
    ): Promise<void> => {
      if (!otherKey) {
        return;
      }
      if (fromCacheHit && migration?.copyToOtherKey !== "after_read") {
        return;
      }
      await setValue(otherKey, value);
    };

    let cacheVal = await redisCli.get(readKey);
    if (cacheVal) {
      await copyToOtherKey(cacheVal, { fromCacheHit: true });
      return JSON.parse(cacheVal) as JsonSerializable<T>;
    }

    // specific try-finally to ensure unlock is called only after lock
    let lockValue: string | undefined;
    try {
      // if value not found, lock, recheck and set
      // we avoid locking for the first read to allow parallel calls to redis if the value is set
      if (useDistributedLock) {
        lockValue = await distributedLock(redisCli, readKey);

        if (!lockValue) {
          if (skipIfLocked) {
            return null;
          }

          // Spin-wait for the lock owner to populate the cache.
          while (!lockValue) {
            await new Promise((resolve) =>
              setTimeout(resolve, SPIN_WAIT_INTERVAL_MS)
            );
            cacheVal = await redisCli.get(readKey);
            if (cacheVal) {
              await copyToOtherKey(cacheVal, { fromCacheHit: true });
              return JSON.parse(cacheVal) as JsonSerializable<T>;
            }
            lockValue = await distributedLock(redisCli, readKey);
          }
        }
      } else {
        await lock(readKey);
      }
      cacheVal = await redisCli.get(readKey);
      if (cacheVal) {
        await copyToOtherKey(cacheVal, { fromCacheHit: true });
        return JSON.parse(cacheVal) as JsonSerializable<T>;
      }

      const result = await fn(...args);
      if (cacheNullValues || result != null) {
        const serializedResult = JSON.stringify(result);
        await setValue(readKey, serializedResult);
        await copyToOtherKey(serializedResult, {
          fromCacheHit: false,
        });
      }
      return result;
    } finally {
      if (useDistributedLock) {
        if (lockValue) {
          await distributedUnlock(redisCli, readKey, lockValue);
        }
      } else {
        unlock(readKey);
      }
    }
  };
}

// Wraps cacheWithRedisResult's error so it can round-trip through
// cacheWithRedis's throw-to-skip-caching contract without ever escaping to a
// caller of cacheWithRedisResult.
class CacheResultError<E> extends Error {
  constructor(public readonly original: E) {
    super("cacheWithRedisResult: wrapped domain error");
  }
}

// Same fetch-dedup semantics as cacheWithRedis (fleet-wide single-flight via
// the distributed lock), but for loaders that report failure through Result<>
// instead of throwing. The loader's Err is never cached and is returned to
// the caller as a Result, so callers can use `.isErr()` instead of try/catch.
export function cacheWithRedisResult<T, E, Args extends unknown[]>(
  fn: (...args: Args) => Promise<Result<JsonSerializable<T>, E>>,
  resolver: KeyResolver<Args>,
  options: {
    cacheId?: string;
    ttlMs?: number | ((...args: Args) => number);
    useDistributedLock: true;
    skipIfLocked: true;
    cacheNullValues?: boolean;
    migration?: CacheKeyMigration<Args>;
  }
): (...args: Args) => Promise<Result<JsonSerializable<T> | null, E>> {
  const cacheId = options.cacheId ?? fn.name;

  const cachedFn = cacheWithRedis<T, Args>(
    async (...args: Args) => {
      const result = await fn(...args);
      if (result.isErr()) {
        throw new CacheResultError(result.error);
      }
      return result.value;
    },
    resolver,
    { ...options, cacheId }
  );

  return async function (...args: Args) {
    try {
      const value = await cachedFn(...args);
      return new Ok(value);
    } catch (err) {
      if (err instanceof CacheResultError) {
        return new Err(err.original as E);
      }
      throw err;
    }
  };
}

export function warmCacheWithRedis<T, Args extends unknown[]>(
  fn: CacheableFunction<JsonSerializable<T>, Args>,
  resolver: KeyResolver<Args>,
  { ttlMs }: { ttlMs?: number } = {}
): (value: JsonSerializable<T>, ...args: Args) => Promise<void> {
  if (ttlMs !== undefined && ttlMs > 60 * 60 * 24 * 1000) {
    throw new Error("ttlMs should be less than 24 hours");
  }
  return async function (
    value: JsonSerializable<T>,
    ...args: Args
  ): Promise<void> {
    const key = getCacheKey(fn, resolver, args);
    const redisCli = await getRedisCacheClient({ origin: "cache_with_redis" });
    if (ttlMs !== undefined) {
      await redisCli.set(key, JSON.stringify(value), { PX: ttlMs });
    } else {
      await redisCli.set(key, JSON.stringify(value));
    }
  };
}

export function invalidateCacheWithRedis<T, Args extends unknown[]>(
  fn: CacheableFunction<T, Args>,
  resolver: KeyResolver<Args>,
  // Kept for backwards compatibility, no longer used.
  _options?: {
    cacheId?: string;
    redisUri?: string;
    migration?: CacheKeyMigration<Args>;
  }
): (...args: Args) => Promise<void> {
  return async function (...args: Args): Promise<void> {
    const redisCli = await getRedisCacheClient({ origin: "cache_with_redis" });

    const newKey = getCacheKey(fn, resolver, args, _options?.cacheId);
    const previousKey = _options?.migration
      ? getCacheKey(
          fn,
          _options.migration.previousKey.resolver,
          args,
          _options.migration.previousKey.cacheId
        )
      : null;
    await redisCli.del(previousKey ? [newKey, previousKey] : newKey);
  };
}

export function batchInvalidateCacheWithRedis<T, Args extends unknown[]>(
  fn: CacheableFunction<T, Args>,
  resolver: KeyResolver<Args>,
  // Kept for backwards compatibility, no longer used.
  _options?: {
    cacheId?: string;
    redisUri?: string;
    migration?: CacheKeyMigration<Args>;
  }
): (argsList: Args[]) => Promise<void> {
  return async function (argsList: Args[]): Promise<void> {
    if (argsList.length === 0) {
      return;
    }

    const redisCli = await getRedisCacheClient({ origin: "cache_with_redis" });

    const keys = new Set<string>();
    for (const args of argsList) {
      keys.add(getCacheKey(fn, resolver, args, _options?.cacheId));
      if (_options?.migration) {
        keys.add(
          getCacheKey(
            fn,
            _options.migration.previousKey.resolver,
            args,
            _options.migration.previousKey.cacheId
          )
        );
      }
    }
    await redisCli.del([...keys]);
  };
}

export function bestEffortInvalidateCacheWithRedis<T, Args extends unknown[]>(
  fn: CacheableFunction<T, Args>,
  resolver: KeyResolver<Args>,
  label: string
): (...args: Args) => Promise<void> {
  const invalidate = invalidateCacheWithRedis(fn, resolver);
  return async function (...args: Args): Promise<void> {
    try {
      await invalidate(...args);
    } catch (err) {
      logger.warn(
        { err: normalizeError(err), cacheKey: resolver(...args) },
        `Failed to invalidate cache: ${label}`
      );
    }
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

/**
 * Defers cache invalidation until after a transaction commits.
 * This prevents a race condition where:
 * 1. Cache is invalidated inside the transaction
 * 2. Another request reads the DB (can't see uncommitted data)
 * 3. Cache repopulated with stale data
 * 4. Transaction commits
 * 5. Cache now has stale data for TTL duration
 */
export function invalidateCacheAfterCommit(
  transaction: Transaction | undefined,
  invalidateFn: () => Promise<void>
): void {
  if (transaction) {
    transaction.afterCommit(() =>
      invalidateFn().catch((err) => {
        logger.error(
          { panic: true, err },
          "Failed to invalidate cache after transaction commit"
        );
      })
    );
  } else {
    invalidateFn().catch((err) => {
      logger.error(
        { panic: true, err },
        "Failed to invalidate cache after transaction commit"
      );
    });
  }
}
