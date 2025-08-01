import { redisClient } from "../shared/redis_client";

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

// Wrapper function to cache the result of a function with Redis.
// Usage:
// const cachedFn = cacheWithRedis(fn, (fnArg1, fnArg2, ...) => `${fnArg1}-${fnArg2}`, 60 * 10 * 1000);
// eslint-disable-next-line @typescript-eslint/no-explicit-any

// if caching big objects, there is a possible race condition (mulitple calls to
// caching), therefore, we use a lock
export function cacheWithRedis<T, Args extends unknown[]>(
  fn: CacheableFunction<JsonSerializable<T>, Args>,
  resolver: KeyResolver<Args>,
  ttlMs: number,
  redisUri?: string
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
    let redisCli: Awaited<ReturnType<typeof redisClient>> | undefined =
      undefined;

    const key = `cacheWithRedis-${fn.name}-${resolver(...args)}`;

    try {
      redisCli = await redisClient({
        origin: "cache_with_redis",
        redisUri,
      });
      let cacheVal = await redisCli.get(key);
      if (cacheVal) {
        return JSON.parse(cacheVal) as JsonSerializable<T>;
      }

      // specific try-finally to ensure unlock is called only after lock
      try {
        // if value not found, lock, recheck and set
        // we avoid locking for the first read to allow parallel calls to redis if the value is set
        await lock(key);
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
        unlock(key);
      }
    } finally {
      if (redisCli) {
        await redisCli.quit();
      }
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

/**
 * Fetches items with individual Redis caching. Only fetches items that aren't cached.
 * Similar to cacheWithRedis but caches each item individually for better cache reuse.
 */
export async function cacheWithRedisBatched<T, K>({
  items,
  keyResolver,
  fetchMissing,
  ttlMs,
  redisUri,
}: {
  items: K[];
  keyResolver: (item: K) => string;
  fetchMissing: (missingItems: K[]) => Promise<Map<K, T | null>>;
  ttlMs: number;
  redisUri?: string;
}): Promise<T[]> {
  if (items.length === 0) {
    return [];
  }
  if (ttlMs > 60 * 60 * 24 * 1000) {
    throw new Error("ttlMs should be less than 24 hours");
  }

  const REDIS_URI = redisUri || process.env.REDIS_CACHE_URI;
  if (!REDIS_URI) {
    throw new Error("REDIS_CACHE_URI is not set");
  }

  const redisCli = await redisClient({
    origin: "cache_with_redis",
    redisUri: REDIS_URI,
  });

  try {
    const results: T[] = [];
    const itemsToFetch: K[] = [];

    // Bulk cache check
    const cacheKeys = items.map(keyResolver);
    const cachedValues = await redisCli.mGet(cacheKeys);

    // Separate cached from missing items
    items.forEach((item, i) => {
      const cachedValue = cachedValues[i];
      if (!cachedValue) {
        itemsToFetch.push(item);
        return;
      }

      try {
        const cachedItem = JSON.parse(cachedValue) as T | null;
        if (cachedItem) {
          results.push(cachedItem);
        }
        // Note: null values (non-existent items) are cached but not added to results
      } catch {
        // If JSON parsing fails, treat as cache miss
        itemsToFetch.push(item);
      }
    });

    // Fetch and cache missing items
    if (itemsToFetch.length > 0) {
      const fetchedItemMap = await fetchMissing(itemsToFetch);

      // Cache all fetched items and add existing ones to results
      await Promise.all(
        itemsToFetch.map(async (item) => {
          const fetchedItem = fetchedItemMap.get(item);
          await redisCli.set(keyResolver(item), JSON.stringify(fetchedItem), {
            PX: ttlMs,
          });
          if (fetchedItem) {
            results.push(fetchedItem);
          }
        })
      );
    }

    return results;
  } finally {
    await redisCli.quit();
  }
}
