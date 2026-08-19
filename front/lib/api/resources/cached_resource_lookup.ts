import type { JsonSerializable } from "@app/lib/utils/cache";
import {
  buildCacheWithRedisKey,
  cacheWithRedis,
  invalidateCacheAfterCommit,
  invalidateCacheWithRedis,
} from "@app/lib/utils/cache";
import type {
  CacheOperationParam,
  CacheOperations,
} from "@app/lib/utils/cache_operations";
import { defineCacheOperations } from "@app/lib/utils/cache_operations";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Transaction } from "sequelize";
import type { z } from "zod";

type CacheKeyDefinition<Input> = {
  cacheId: string;
  key: (input: Input) => string;
  keyPattern: string;
};

type ReadFromKeyFirstDefinition<Input> = CacheKeyDefinition<Input> & {
  mirrorToCanonicalOnHit?: boolean;
};

type CachedResourceLookupDefinition<Input, Snapshot, Resource> = {
  id: string;
  version: number;
  key: (input: Input) => string;
  readFromKeyFirst?: ReadFromKeyFirstDefinition<Input>;
  loadFromDatabase: (
    input: Input,
    transaction?: Transaction
  ) => Promise<Resource | null>;
  toSnapshot: (resource: Resource) => JsonSerializable<Snapshot>;
  fromSnapshot: (
    snapshot: JsonSerializable<Snapshot>
  ) => Promise<Resource> | Resource;
};

export type CachedResourceLookup<Input, Resource> = {
  fetch: (input: Input, transaction?: Transaction) => Promise<Resource | null>;
  invalidate: (input: Input, transaction?: Transaction) => Promise<void>;
};

type OperableCachedResourceLookup<Input, Resource> = CachedResourceLookup<
  Input,
  Resource
> & {
  createCacheOperations: <OperationsInput>(definition: {
    label: string;
    params: CacheOperationParam[];
    inputSchema: z.ZodType<OperationsInput>;
    toLookupInput: (input: OperationsInput) => Input;
  }) => CacheOperations;
};

// Marks database errors so they are not mistaken for Redis failures and retried by the database
// fallback below.
class ResourceDatabaseLoadError {
  constructor(readonly cause: unknown) {}
}

/**
 * Use when a Resource lookup returns Resource instances. For counts or other query results,
 * use `defineCache` instead.
 */
export function defineCachedResourceLookup<Input, Snapshot, Resource>({
  id,
  version,
  key,
  readFromKeyFirst,
  loadFromDatabase,
  toSnapshot,
  fromSnapshot,
}: CachedResourceLookupDefinition<
  Input,
  Snapshot,
  Resource
>): OperableCachedResourceLookup<Input, Resource> {
  const versionedKey = (input: Input) => `v${version}:${key(input)}`;
  const readFromKeyFirstOptions = readFromKeyFirst
    ? {
        cacheId: readFromKeyFirst.cacheId,
        resolver: readFromKeyFirst.key,
        mirrorToCanonicalOnHit: readFromKeyFirst.mirrorToCanonicalOnHit,
      }
    : undefined;
  const operationsCacheKey = readFromKeyFirst ?? {
    cacheId: id,
    key: versionedKey,
    keyPattern: `v${version}:*`,
  };

  const loadSnapshotFromDatabase = async (
    input: Input
  ): Promise<JsonSerializable<Snapshot> | null> => {
    try {
      const resource = await loadFromDatabase(input);
      return resource ? toSnapshot(resource) : null;
    } catch (err) {
      throw new ResourceDatabaseLoadError(err);
    }
  };

  const fetchSnapshot = cacheWithRedis<Snapshot, [Input]>(
    loadSnapshotFromDatabase,
    versionedKey,
    {
      cacheId: id,
      cacheNullValues: false,
      readFromKeyFirst: readFromKeyFirstOptions,
    }
  );
  const invalidateSnapshot = invalidateCacheWithRedis(
    loadSnapshotFromDatabase,
    versionedKey,
    {
      cacheId: id,
      readFromKeyFirst: readFromKeyFirstOptions,
    }
  );

  return {
    fetch: async (input, transaction) => {
      if (transaction) {
        return loadFromDatabase(input, transaction);
      }

      try {
        const snapshot = await fetchSnapshot(input);
        return snapshot !== null ? fromSnapshot(snapshot) : null;
      } catch (err) {
        if (err instanceof ResourceDatabaseLoadError) {
          throw err.cause;
        }
        logger.warn(
          { cacheId: id, err: normalizeError(err) },
          "Resource cache read failed; falling back to the database"
        );
        return loadFromDatabase(input);
      }
    },
    invalidate: async (input, transaction) => {
      if (transaction) {
        invalidateCacheAfterCommit(transaction, () =>
          invalidateSnapshot(input)
        );
        return;
      }
      await invalidateSnapshot(input);
    },
    createCacheOperations: ({ label, params, inputSchema, toLookupInput }) =>
      defineCacheOperations({
        id,
        label,
        params,
        inputSchema,
        buildKey: (input) =>
          buildCacheWithRedisKey(
            operationsCacheKey.cacheId,
            operationsCacheKey.key(toLookupInput(input))
          ),
        keyPattern: buildCacheWithRedisKey(
          operationsCacheKey.cacheId,
          operationsCacheKey.keyPattern
        ),
      }),
  };
}
