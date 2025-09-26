import { redisCacheClient } from "./redis_client";

// JSON-serializable primitive types.
type JsonPrimitive = string | number | boolean | null;

// Recursive type to check if a type is JSON-serializable.
type RecursiveJsonSerializable<T> = T extends JsonPrimitive
  ? T
  : T extends (infer U)[]
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

// Wrapper function to cache the result of a function with Redis.
// Usage:
// const cachedFn = cacheWithRedis(fn, (fnArg1, fnArg2, ...) => `${fnArg1}-${fnArg2}`, 60 * 10 * 1000);
// eslint-disable-next-line @typescript-eslint/no-explicit-any

// if caching big objects, there is a possible race condition (mulitple calls to
// caching), therefore, we use a lock
export function cacheWithRedis<T, Args extends unknown[]>(
  fn: CacheableFunction<JsonSerializable<T>, Args>,
  resolver: KeyResolver<Args>,
  {
    ttlMs,
  }: {
    ttlMs: number;
  }
): (...args: Args) => Promise<JsonSerializable<T>> {
  if (ttlMs > 60 * 60 * 24 * 1000) {
    throw new Error("ttlMs should be less than 24 hours");
  }

  return async (...args: Args): Promise<JsonSerializable<T>> => {
    const redis = await redisCacheClient({ origin: "cache_with_redis" });

    const key = `cacheWithRedis-${fn.name}-${resolver(...args)}`;

    let cacheVal = await redis.get(key);
    if (cacheVal) {
      return JSON.parse(cacheVal) as JsonSerializable<T>;
    }

    // specific try-finally to ensure unlock is called only after lock
    try {
      // if value not found, lock, recheck and set
      // we avoid locking for the first read to allow parallel calls to redis if the value is set
      await lock(key);
      cacheVal = await redis.get(key);
      if (cacheVal) {
        return JSON.parse(cacheVal) as JsonSerializable<T>;
      }

      const result = await fn(...args);
      await redis.set(key, JSON.stringify(result), {
        PX: ttlMs,
      });
      return result;
    } finally {
      unlock(key);
    }
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
const locks: Record<string, (() => void)[]> = {};

async function lock(key: string) {
  return new Promise<void>((resolve) => {
    const existingLock = locks[key];
    if (existingLock && Array.isArray(existingLock)) {
      existingLock.push(resolve);
    } else {
      // use array to allow multiple locks
      // array set to empty indicates first lock
      locks[key] = [];
      resolve();
    }
  });
}

function unlock(key: string) {
  const existingLock = locks[key];
  if (existingLock === undefined) {
    throw new Error("Unreachable: unlock called without lock");
  }
  if (existingLock && Array.isArray(existingLock)) {
    if (existingLock.length === 0) {
      delete locks[key];
      return;
    }

    const unlockFn = existingLock.pop();
    if (!unlockFn) {
      throw new Error("Unreachable: unlock called without lock");
    }
    unlockFn();
  }
}
