import type { JsonSerializable } from "@app/lib/utils/cache";
import {
  cacheWithRedis,
  invalidateCacheAfterCommit,
  invalidateCacheWithRedis,
} from "@app/lib/utils/cache";
import type { Transaction } from "sequelize";

type CacheHandleDefinition<Input, Value> = {
  id: string;
  key: (input: Input) => string;
  load: (input: Input) => Promise<JsonSerializable<Value>>;
  ttlMs?: number | ((input: Input) => number);
  cacheNullValues?: boolean;
};

export type CacheHandle<Input, Value> = {
  read: (input: Input) => Promise<JsonSerializable<Value>>;
  invalidate: (input: Input, transaction?: Transaction) => Promise<void>;
};

export function defineCache<Input, Value>({
  id,
  key,
  load,
  ttlMs,
  cacheNullValues,
}: CacheHandleDefinition<Input, Value>): CacheHandle<Input, Value> {
  const cached = cacheWithRedis(load, key, {
    cacheId: id,
    ttlMs,
    cacheNullValues,
  });
  const invalidateCached = invalidateCacheWithRedis(load, key, {
    cacheId: id,
  });

  return {
    read: cached,
    invalidate: async (input, transaction) => {
      if (transaction) {
        invalidateCacheAfterCommit(transaction, () => invalidateCached(input));
        return;
      }
      await invalidateCached(input);
    },
  };
}

type DeferredCacheDefinition<Input, Value> = Omit<
  CacheHandleDefinition<Input, Value>,
  "load"
>;

export type DeferredCache<Input, Value> = {
  read: (
    input: Input,
    load: () => Promise<JsonSerializable<Value>>
  ) => Promise<JsonSerializable<Value>>;
  invalidate: CacheHandle<Input, Value>["invalidate"];
};

export function defineDeferredCache<Input, Value>({
  id,
  key,
  ttlMs,
  cacheNullValues,
}: DeferredCacheDefinition<Input, Value>): DeferredCache<Input, Value> {
  type DeferredInput = {
    input: Input;
    load: () => Promise<JsonSerializable<Value>>;
  };

  const cache = defineCache<DeferredInput, Value>({
    id,
    key: ({ input }) => key(input),
    load: ({ load }) => load(),
    ttlMs: typeof ttlMs === "function" ? ({ input }) => ttlMs(input) : ttlMs,
    cacheNullValues,
  });
  return {
    read: (input, load) => cache.read({ input, load }),
    invalidate: (input, transaction) =>
      cache.invalidate(
        {
          input,
          load: async () => {
            throw new Error("Cache loader called during invalidation.");
          },
        },
        transaction
      ),
  };
}
