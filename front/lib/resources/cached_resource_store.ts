import { DataTypes } from "@app/lib/resources/storage/data_types";
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
import type {
  Attributes,
  CreationAttributes,
  FindOptions,
  Model,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
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
 * Low-level single-value lookup with hand-written snapshots. Internal to this module: resources
 * should declare a `defineCachedResourceStore` (single row, blob snapshot) or a
 * `defineCachedResourceList` instead.
 */
function defineCachedResourceLookup<Input, Snapshot, Resource>({
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

// Serialized form of a model's attributes: DATE attributes are stored as epoch milliseconds,
// everything else is cached as-is.
type SerializedBlobValue<V> = V extends Date ? number : V;
type SerializedBlob<M extends Model> = {
  [K in keyof Attributes<M>]: SerializedBlobValue<Attributes<M>[K]>;
};

// Models carrying a workspaceId are workspace-scoped and cannot use this store: they need a
// variant that takes an Authenticator, scopes every where clause to the workspace id, and
// re-checks blob ownership after cache reads (a cache hit skips the SQL scoping). Global models
// such as workspace and user are the exception this store serves.
type GlobalModelOnly<M extends Model> =
  "workspaceId" extends keyof Attributes<M>
    ? "this model is workspace-scoped: it requires the Authenticator-scoped store variant"
    : unknown;

// Attributes eligible as a cache key: string or number valued columns.
type CacheKeyAttribute<M extends Model> = {
  [K in keyof Attributes<M>]: Attributes<M>[K] extends string | number
    ? K
    : never;
}[keyof Attributes<M>] &
  string;

type CachedResourceStoreDefinition<
  M extends Model,
  K extends CacheKeyAttribute<M>,
  Resource,
> = {
  model: ModelStatic<M>;
  materialize: (blobs: Attributes<M>[]) => Promise<Resource[]>;
  cache: {
    id: string;
    version: number;
    // Column carrying the cache key. Must be unique and immutable: the Redis key, the cache-miss
    // loader and blob invalidation are all derived from it.
    keyAttribute: K;
    migration?: CacheKeyMigrationDefinition<Attributes<M>[K]>;
  };
};

export type CachedResourceStore<
  M extends Model,
  K extends CacheKeyAttribute<M>,
  Resource,
> = {
  // `attributes` projections are excluded: materialize requires full rows.
  baseFetch: (
    options?: Omit<FindOptions<Attributes<M>>, "attributes">
  ) => Promise<Resource[]>;
  fetchCached: (
    input: Attributes<M>[K],
    transaction?: Transaction
  ) => Promise<Resource | null>;
  create: (
    blob: CreationAttributes<M>,
    transaction?: Transaction
  ) => Promise<Resource>;
  invalidateBlob: (
    blob: Attributes<M>,
    transaction?: Transaction
  ) => Promise<void>;
  // Key-based counterpart of invalidateBlob, for callers that only hold the cache key (e.g.
  // invalidation after out-of-band writes such as a relocation).
  invalidateCached: (
    input: Attributes<M>[K],
    transaction?: Transaction
  ) => Promise<void>;
  createCacheOperations: <OperationsInput>(definition: {
    label: string;
    params: CacheOperationParam[];
    inputSchema: z.ZodType<OperationsInput>;
    toLookupInput: (input: OperationsInput) => Attributes<M>[K];
  }) => CacheOperations;
};

/**
 * The row ↔ resource lifecycle of a Resource, declared once. This is a repository whose defining
 * feature is the materialization boundary: the declared `materialize` runs on every path that
 * yields resources to callers (cache hit, transaction bypass, Redis fallback, uncached query,
 * creation). Caching is one capability on top. The store's internal currency is raw blobs: the
 * cache stores the full set of model attributes, serialized from the model definition (blobs must
 * be JSON-serializable apart from DATE attributes).
 *
 * The cached snapshot shape follows the model implicitly: whenever the model gains, loses, or
 * retypes an attribute, bump `cache.version`. Entries have no TTL, so stale-shaped snapshots
 * otherwise live until the row is next invalidated.
 *
 * Only global models may use this store: passing a model with a workspaceId column is a type
 * error (see GlobalModelOnly).
 */
export function defineCachedResourceStore<
  M extends Model,
  K extends CacheKeyAttribute<M>,
  Resource,
>(
  definition: CachedResourceStoreDefinition<M, K, Resource> & GlobalModelOnly<M>
): CachedResourceStore<M, K, Resource> {
  const { model, materialize, cache } = definition;
  const dateAttributeNames = Object.entries(model.getAttributes())
    .filter(([, attribute]) => attribute.type instanceof DataTypes.DATE)
    .map(([attributeName]) => attributeName);

  const blobLookup = defineCachedResourceLookup<
    Attributes<M>[K],
    SerializedBlob<M>,
    Attributes<M>
  >({
    id: cache.id,
    version: cache.version,
    key: (input) => String(input),
    migration: cache.migration,
    loadFromDatabase: async (input, transaction) => {
      const row = await model.findOne({
        // Sequelize cannot type a computed generic key; the value is Attributes<M>[K].
        where: { [cache.keyAttribute]: input } as WhereOptions<Attributes<M>>,
        transaction,
      });
      return row ? row.get() : null;
    },
    toSnapshot: (blob) => {
      const snapshot: Record<string, unknown> = { ...blob };
      for (const attributeName of dateAttributeNames) {
        const value = snapshot[attributeName];
        if (value instanceof Date) {
          snapshot[attributeName] = value.getTime();
        }
      }
      // The attribute-driven Date rewrite above cannot be expressed in the type system.
      return snapshot as JsonSerializable<SerializedBlob<M>>;
    },
    fromSnapshot: (snapshot) => {
      const blob: Record<string, unknown> = { ...snapshot };
      for (const attributeName of dateAttributeNames) {
        const value = blob[attributeName];
        if (typeof value === "number") {
          blob[attributeName] = new Date(value);
        }
      }
      // The attribute-driven Date rewrite above cannot be expressed in the type system.
      return blob as Attributes<M>;
    },
  });

  const invalidateBlob = async (
    blob: Attributes<M>,
    transaction?: Transaction
  ) => blobLookup.invalidate(blob[cache.keyAttribute], transaction);

  return {
    baseFetch: async (options) => {
      const rows = await model.findAll(options);
      return materialize(rows.map((row) => row.get()));
    },
    fetchCached: async (input, transaction) => {
      const blob = await blobLookup.fetch(input, transaction);
      if (!blob) {
        return null;
      }
      const [resource] = await materialize([blob]);
      return resource ?? null;
    },
    create: async (blob, transaction) => {
      const row = await model.create(blob, { transaction });
      await invalidateBlob(row.get(), transaction);
      const [resource] = await materialize([row.get()]);
      if (!resource) {
        throw new Error(
          `materialize dropped the row just created in ${cache.id}`
        );
      }
      return resource;
    },
    invalidateBlob,
    invalidateCached: (input, transaction) =>
      blobLookup.invalidate(input, transaction),
    createCacheOperations: blobLookup.createCacheOperations,
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
