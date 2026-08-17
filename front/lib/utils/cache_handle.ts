import type { JsonSerializable } from "@app/lib/utils/cache";
import {
  cacheWithRedis,
  invalidateCacheAfterCommit,
  invalidateCacheWithRedis,
} from "@app/lib/utils/cache";
import type { Transaction } from "sequelize";

type CacheDefinition<Input, Value> = {
  id: string;
  key: (input: Input) => string;
  load: (input: Input) => Promise<JsonSerializable<Value>>;
  ttlMs?: number | ((input: Input) => number);
  cacheNullValues?: boolean;
};

export type Cache<Input, Value> = {
  get: (input: Input) => Promise<JsonSerializable<Value>>;
  invalidate: (input: Input, transaction?: Transaction) => Promise<void>;
};

/**
 * Use for cached values such as counts or query results. If the cache returns Resource instances,
 * use `defineCachedResourceLookup` instead.
 */
export function defineCache<Input, Value>({
  id,
  key,
  load,
  ttlMs,
  cacheNullValues,
}: CacheDefinition<Input, Value>): Cache<Input, Value> {
  const getCached = cacheWithRedis(load, key, {
    cacheId: id,
    ttlMs,
    cacheNullValues,
  });
  const invalidateCached = invalidateCacheWithRedis(load, key, {
    cacheId: id,
  });

  return {
    get: getCached,
    invalidate: async (input, transaction) => {
      if (transaction) {
        invalidateCacheAfterCommit(transaction, () => invalidateCached(input));
        return;
      }
      await invalidateCached(input);
    },
  };
}
