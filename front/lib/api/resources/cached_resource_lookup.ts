import type { JsonSerializable } from "@app/lib/utils/cache";
import {
  batchInvalidateCacheWithRedis,
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

type CacheKeyMigrationDefinition<Input> = {
  previousKey: CacheKeyDefinition<Input>;
  readFrom: "previous" | "new";
  copyToOtherKey: "after_load" | "after_read";
};

type CachedResourceLookupDefinition<Input, Snapshot, Resource> = {
  id: string;
  version: number;
  key: (input: Input) => string;
  migration?: CacheKeyMigrationDefinition<Input>;
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
  invalidateMany: (
    inputs: readonly Input[],
    transaction?: Transaction
  ) => Promise<void>;
};

type CachedResourceListDefinition<Input, Snapshot, Resource> = Omit<
  CachedResourceLookupDefinition<Input, Snapshot, Resource[]>,
  "loadFromDatabase"
> & {
  loadFromDatabase: (
    input: Input,
    transaction?: Transaction
  ) => Promise<Resource[]>;
};

export type CachedResourceList<Input, Resource> = {
  fetch: (input: Input, transaction?: Transaction) => Promise<Resource[]>;
  invalidate: (input: Input, transaction?: Transaction) => Promise<void>;
  invalidateMany: (
    inputs: readonly Input[],
    transaction?: Transaction
  ) => Promise<void>;
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

type OperableCachedResourceList<Input, Resource> = CachedResourceList<
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
  migration,
  loadFromDatabase,
  toSnapshot,
  fromSnapshot,
}: CachedResourceLookupDefinition<
  Input,
  Snapshot,
  Resource
>): OperableCachedResourceLookup<Input, Resource> {
  const versionedKey = (input: Input) => `v${version}:${key(input)}`;
  const migrationOptions = migration
    ? {
        previousKey: {
          cacheId: migration.previousKey.cacheId,
          resolver: migration.previousKey.key,
        },
        readFrom: migration.readFrom,
        copyToOtherKey: migration.copyToOtherKey,
      }
    : undefined;
  const newCacheKey = {
    cacheId: id,
    key: versionedKey,
    keyPattern: `v${version}:*`,
  };
  const operationsCacheKey =
    migration?.readFrom === "previous" ? migration.previousKey : newCacheKey;
  const cacheKeysToDelete = migration
    ? [newCacheKey, migration.previousKey]
    : [newCacheKey];

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
      migration: migrationOptions,
    }
  );
  const invalidateSnapshot = invalidateCacheWithRedis(
    loadSnapshotFromDatabase,
    versionedKey,
    {
      cacheId: id,
      migration: migrationOptions,
    }
  );
  const invalidateSnapshots = batchInvalidateCacheWithRedis(
    loadSnapshotFromDatabase,
    versionedKey,
    {
      cacheId: id,
      migration: migrationOptions,
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
    invalidateMany: async (inputs, transaction) => {
      const argsList = inputs.map((input): [Input] => [input]);
      if (transaction) {
        invalidateCacheAfterCommit(transaction, () =>
          invalidateSnapshots(argsList)
        );
        return;
      }
      await invalidateSnapshots(argsList);
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
        buildKeysToDelete: (input) =>
          cacheKeysToDelete.map((cacheKey) =>
            buildCacheWithRedisKey(
              cacheKey.cacheId,
              cacheKey.key(toLookupInput(input))
            )
          ),
        keyPattern: buildCacheWithRedisKey(
          operationsCacheKey.cacheId,
          operationsCacheKey.keyPattern
        ),
        keyPatternsToDelete: cacheKeysToDelete.map((cacheKey) =>
          buildCacheWithRedisKey(cacheKey.cacheId, cacheKey.keyPattern)
        ),
      }),
  };
}

/**
 * List-shaped counterpart to `defineCachedResourceLookup`. The collection is
 * cached as one versioned snapshot while callers always receive Resource
 * instances and never need to handle a nullable cache result.
 */
export function defineCachedResourceList<Input, Snapshot, Resource>(
  definition: CachedResourceListDefinition<Input, Snapshot, Resource>
): OperableCachedResourceList<Input, Resource> {
  const lookup = defineCachedResourceLookup<Input, Snapshot, Resource[]>({
    ...definition,
    loadFromDatabase: definition.loadFromDatabase,
  });

  return {
    fetch: async (input, transaction) =>
      (await lookup.fetch(input, transaction)) ?? [],
    invalidate: lookup.invalidate,
    invalidateMany: lookup.invalidateMany,
    createCacheOperations: lookup.createCacheOperations,
  };
}
