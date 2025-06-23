import { parse, stringify } from "superjson";

import { redisClient } from "@app/lib/utils/redis_client";

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

export const getRedisCacheClient = async () => {
  const REDIS_CACHE_URI = process.env.REDIS_CACHE_URI;
  if (!REDIS_CACHE_URI) {
    throw new Error("REDIS_CACHE_URI is not set");
  }

  const redisCli = await redisClient({
    origin: "cache_with_redis",
    redisUri: REDIS_CACHE_URI,
  });

  return redisCli;
};

export const CACHE_WITH_REDIS_KEY = "cacheWithRedis";
export const CACHE_WITH_REDIS_MAX_TTL = 60 * 60 * 24 * 1000;

export type CacheWithRedisOptions = {
  ttlMs: number;
  redisUri?: string;
  prefix?: string;
};

// Wrapper function to cache the result of a function with Redis.
// Usage:
// const cachedFn = cacheWithRedis(fn, (fnArg1, fnArg2, ...) => `${fnArg1}-${fnArg2}`, 60 * 10 * 1000);
// eslint-disable-next-line @typescript-eslint/no-explicit-any

// if caching big objects, there is a possible race condition (mulitple calls to
// caching), therefore, we use a lock
export function cacheWithRedis<T, Args extends unknown[]>(
  fn: CacheableFunction<T, Args>,
  resolver: KeyResolver<Args>,
  { ttlMs, redisUri, prefix }: CacheWithRedisOptions
): (...args: Args) => Promise<T> {
  if (ttlMs > CACHE_WITH_REDIS_MAX_TTL) {
    throw new Error("ttlMs should be less than 24 hours");
  }

  return async function (...args: Args): Promise<T> {
    if (!redisUri) {
      const REDIS_CACHE_URI = process.env.REDIS_CACHE_URI;
      if (!REDIS_CACHE_URI) {
        throw new Error("REDIS_CACHE_URI is not set");
      }
      redisUri = REDIS_CACHE_URI;
    }
    let redisCli: Awaited<ReturnType<typeof redisClient>> | undefined =
      undefined;

    const key = `${CACHE_WITH_REDIS_KEY}-${prefix ? `${prefix}-` : ""}${fn.name}-${resolver(...args)}`;

    try {
      redisCli = await redisClient({
        origin: "cache_with_redis",
        redisUri,
      });
      let cacheVal = await redisCli.get(key);
      if (cacheVal) {
        return parse<JsonSerializable<T>>(cacheVal);
      }

      // specific try-finally to ensure unlock is called only after lock
      try {
        // if value not found, lock, recheck and set
        // we avoid locking for the first read to allow parallel calls to redis if the value is set
        await lock(key);
        cacheVal = await redisCli.get(key);
        if (cacheVal) {
          return parse<JsonSerializable<T>>(cacheVal);
        }

        const result = await fn(...args);
        await redisCli.set(key, stringify(result), {
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
