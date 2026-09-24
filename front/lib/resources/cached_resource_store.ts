import { DataTypes } from "@app/lib/resources/storage/data_types";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { JsonSerializable } from "@app/lib/utils/cache";
import {
  batchInvalidateCacheWithRedis,
  buildCacheWithRedisKey,
  cacheManyWithRedis,
  invalidateCacheAfterCommit,
  invalidateCacheWithRedis,
} from "@app/lib/utils/cache";
import type {
  CacheOperationParam,
  CacheOperations,
} from "@app/lib/utils/cache_operations";
import { defineCacheOperations } from "@app/lib/utils/cache_operations";
import logger from "@app/logger/logger";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import assert from "assert";
import differenceWith from "lodash/differenceWith";
import isEqualWith from "lodash/isEqualWith";
import type {
  Attributes,
  CreationAttributes,
  FindOptions,
  Model,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";
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

// Rollout mode of a cached lookup, for staging a new cache into production:
// - "live" (default): read through Redis, falling back to the database on a cache failure, and honor
//   invalidation.
// - "dryRun": reads load from the database (round-tripping the snapshot so serialization is still
//   exercised) and `invalidate` no-ops, so the cache is wired end to end but touches no Redis.
// - "compare": reads warm the cache (read-through write) AND always reload from the database, logging
//   when the two snapshots diverge; the database result stays authoritative and is what callers
//   receive. Invalidation behaves as in "live". For measuring a cache's correctness before trusting
//   it.
export type CachedResourceMode = "live" | "dryRun" | "compare";

export type CachedResourceLookupDefinition<Input, Snapshot, Resource> = {
  id: string;
  version: number;
  key: (input: Input) => string;
  migration?: CacheKeyMigrationDefinition<Input>;
  mode?: CachedResourceMode;
  // One result per input in the same order, including nulls for missing resources.
  loadManyFromDatabase: (
    inputs: readonly Input[],
    transaction?: Transaction
  ) => Promise<(Resource | null)[]>;
  toSnapshot: (resource: Resource) => JsonSerializable<Snapshot>;
  fromSnapshot: (
    snapshot: JsonSerializable<Snapshot>
  ) => Promise<Resource> | Resource;
};

export type CachedResourceLookup<Input, Resource> = {
  fetch: (input: Input, transaction?: Transaction) => Promise<Resource | null>;
  fetchMany: (
    inputs: readonly Input[],
    transaction?: Transaction
  ) => Promise<Resource[]>;
  invalidate: (input: Input, transaction?: Transaction) => Promise<void>;
  invalidateMany: (
    inputs: readonly Input[],
    transaction?: Transaction
  ) => Promise<void>;
};

type CachedResourceListDefinition<Input, Snapshot, Resource> = Omit<
  CachedResourceLookupDefinition<Input, Snapshot, Resource[]>,
  "loadManyFromDatabase"
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

// Plain-object narrowing for the comparison helpers (arrays and null are not records). Kept as a
// typed predicate because lodash's `isPlainObject` is typed `(value) => boolean`, so it would not
// narrow `unknown` to a record.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Deep equality that ignores array element order, so id lists returned in a different order by two
// queries compare equal. Arrays are compared as sets via `differenceWith`; everything else falls
// back to lodash's default deep comparison.
function equalIgnoringArrayOrder(a: unknown, b: unknown): boolean {
  return isEqualWith(a, b, (x, y) =>
    Array.isArray(x) && Array.isArray(y)
      ? x.length === y.length &&
        differenceWith(x, y, equalIgnoringArrayOrder).length === 0
      : undefined
  );
}

// Top-level keys whose values differ between two snapshots, comparing array elements order-
// insensitively. Used by "compare" mode to log which fields drift without dumping the (potentially
// large) snapshot values. Snapshots that are not both records (null, or a non-object shape) are
// compared as whole values and reported as a single `<presence>` divergence.
function snapshotDivergingKeys(
  cached: unknown,
  fromDatabase: unknown
): string[] {
  if (!isRecord(cached) || !isRecord(fromDatabase)) {
    return equalIgnoringArrayOrder(cached, fromDatabase) ? [] : ["<presence>"];
  }
  const keys = new Set([...Object.keys(cached), ...Object.keys(fromDatabase)]);
  return [...keys].filter(
    (key) => !equalIgnoringArrayOrder(cached[key], fromDatabase[key])
  );
}

/**
 * @cc [owner:flvndvd,label:backend;performance] resource-cache-batch-order
 * fetchMany MUST return each found key once, in first-occurrence input order. Single and batch
 * fetches MUST use the same entries and loader. Transaction reads MUST bypass Redis, dry-run reads
 * MUST round-trip snapshots without Redis, and compare reads MUST return the authoritative database
 * row while warming the cache. Empty inputs MUST perform no I/O.
 */
/**
 * Low-level batched lookup with hand-written snapshots. Internal to this module: resources
 * should declare a `defineCachedResourceStore` (single row, attribute-derived blob), a
 * `defineCachedResourceValue` (single value, hand-written snapshot) or a `defineCachedResourceList`
 * instead.
 */
function defineCachedResourceLookup<Input, Snapshot, Resource>({
  id,
  version,
  key,
  migration,
  mode = "live",
  loadManyFromDatabase,
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

  const loadSnapshotsFromDatabase = async (
    inputs: readonly Input[]
  ): Promise<(JsonSerializable<Snapshot> | null)[]> => {
    const resources = await loadManyFromDatabase(inputs);
    assert(
      resources.length === inputs.length,
      "Resource loader must return one value per input"
    );
    return resources.map((resource) =>
      resource === null ? null : toSnapshot(resource)
    );
  };

  const fetchSnapshots = cacheManyWithRedis<Snapshot, Input>(
    loadSnapshotsFromDatabase,
    versionedKey,
    {
      cacheId: id,
      migration: migrationOptions,
    }
  );
  // Invalidation only uses the explicit cache ID and key resolver, never the loader.
  const invalidationLoader = (_input: Input) => Promise.resolve(null);
  const invalidateSnapshot = invalidateCacheWithRedis(
    invalidationLoader,
    versionedKey,
    {
      cacheId: id,
      migration: migrationOptions,
    }
  );
  const invalidateSnapshots = batchInvalidateCacheWithRedis(
    invalidationLoader,
    versionedKey,
    {
      cacheId: id,
      migration: migrationOptions,
    }
  );

  // "compare" mode: warm the cache and always return the authoritative database row, logging any
  // divergence. A call-scoped loader records which inputs the cache missed (and their fresh
  // snapshots) so those are read from the database only once; only cache hits are reloaded to
  // compare against. Returns one snapshot per input, in `uniqueInputs` order.
  const compareSnapshots = async (
    uniqueInputs: readonly Input[]
  ): Promise<(JsonSerializable<Snapshot> | null)[]> => {
    const freshByKey = new Map<string, JsonSerializable<Snapshot> | null>();
    const missedKeys = new Set<string>();
    const warm = cacheManyWithRedis<Snapshot, Input>(
      async (missedInputs) => {
        const loaded = await loadSnapshotsFromDatabase(missedInputs);
        missedInputs.forEach((input, index) => {
          const inputKey = key(input);
          missedKeys.add(inputKey);
          freshByKey.set(inputKey, loaded[index]);
        });
        return loaded;
      },
      versionedKey,
      { cacheId: id, migration: migrationOptions }
    );
    const cachedSnapshots = await warm(uniqueInputs);

    // Cache hits were not loaded by the warmer; reload them once to compare.
    const hitInputs = uniqueInputs.filter(
      (input) => !missedKeys.has(key(input))
    );
    if (hitInputs.length > 0) {
      const freshForHits = await loadSnapshotsFromDatabase(hitInputs);
      hitInputs.forEach((input, index) => {
        freshByKey.set(key(input), freshForHits[index]);
      });
    }

    return uniqueInputs.map((input, index) => {
      const inputKey = key(input);
      const fresh = freshByKey.get(inputKey) ?? null;
      if (!missedKeys.has(inputKey)) {
        const divergingKeys = snapshotDivergingKeys(
          cachedSnapshots[index] ?? null,
          fresh
        );
        if (divergingKeys.length > 0) {
          logger.warn(
            { cacheId: id, key: versionedKey(input), divergingKeys },
            "Resource cache snapshot diverged from the database"
          );
        }
      }
      // The database row stays authoritative for both hits and misses.
      return fresh;
    });
  };

  const fetchMany = async (
    inputs: readonly Input[],
    transaction?: Transaction
  ): Promise<Resource[]> => {
    const uniqueInputs = [
      ...new Map(inputs.map((input) => [key(input), input])).values(),
    ];
    if (uniqueInputs.length === 0) {
      return [];
    }
    if (transaction) {
      return removeNulls(await loadManyFromDatabase(uniqueInputs, transaction));
    }
    let snapshots: (JsonSerializable<Snapshot> | null)[];
    switch (mode) {
      case "dryRun":
        snapshots = await loadSnapshotsFromDatabase(uniqueInputs);
        break;
      case "compare":
        snapshots = await compareSnapshots(uniqueInputs);
        break;
      case "live":
        snapshots = await fetchSnapshots(uniqueInputs);
        break;
      default:
        assertNever(mode);
    }
    return concurrentExecutor(
      removeNulls(snapshots),
      async (snapshot) => fromSnapshot(snapshot),
      { concurrency: 8 }
    );
  };

  return {
    fetch: async (input, transaction) => {
      const [resource] = await fetchMany([input], transaction);
      return resource ?? null;
    },
    fetchMany,
    invalidate: async (input, transaction) => {
      if (mode === "dryRun") {
        return;
      }
      if (transaction) {
        invalidateCacheAfterCommit(transaction, () =>
          invalidateSnapshot(input)
        );
        return;
      }
      await invalidateSnapshot(input);
    },
    invalidateMany: async (inputs, transaction) => {
      if (mode === "dryRun") {
        return;
      }
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
  // Selects keys with the query's filters/order/pagination, then loads full resources by key.
  baseFetch: (
    options?: Omit<FindOptions<Attributes<M>>, "attributes">
  ) => Promise<Resource[]>;
  fetch: (
    input: Attributes<M>[K],
    transaction?: Transaction
  ) => Promise<Resource | null>;
  fetchMany: (
    inputs: readonly Attributes<M>[K][],
    transaction?: Transaction
  ) => Promise<Resource[]>;
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
 * yields resources to callers (cache hit, transaction bypass, Redis fallback, list query,
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
/**
 * @cc [owner:flvndvd,label:backend] resource-store-list-keys
 * baseFetch MUST select keys using the supplied filters, order and pagination, then load them
 * through the same cache and materialization path as fetchMany, preserving selected order.
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
    loadManyFromDatabase: async (inputs, transaction) => {
      const rows = await model.findAll({
        // Sequelize cannot type a computed generic key; the value is Attributes<M>[K].
        where: { [cache.keyAttribute]: { [Op.in]: inputs } } as WhereOptions<
          Attributes<M>
        >,
        transaction,
      });
      const blobsByKey = new Map(
        rows.map((row) => {
          const blob = row.get();
          return [blob[cache.keyAttribute], blob];
        })
      );
      return inputs.map((input) => blobsByKey.get(input) ?? null);
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

  const fetchMany = async (
    inputs: readonly Attributes<M>[K][],
    transaction?: Transaction
  ) => materialize(await blobLookup.fetchMany(inputs, transaction));

  return {
    baseFetch: async (options) => {
      const rows = await model.findAll({
        ...options,
        attributes: [cache.keyAttribute],
      });
      return fetchMany(
        rows.map((row) => row.get()[cache.keyAttribute]),
        options?.transaction ?? undefined
      );
    },
    fetch: async (input, transaction) => {
      const [resource] = await fetchMany([input], transaction);
      return resource ?? null;
    },
    fetchMany,
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

export type CachedResourceValue<Input, Resource> = CachedResourceLookup<
  Input,
  Resource
>;

/**
 * Single-value counterpart to `defineCachedResourceList`: caches one nullable Resource per key via a
 * hand-written `toSnapshot`/`fromSnapshot`, so a resource assembled from multiple rows can be cached.
 * Bump `version` on any snapshot-shape change (entries carry no shape marker).
 */
export function defineCachedResourceValue<Input, Snapshot, Resource>(
  definition: CachedResourceLookupDefinition<Input, Snapshot, Resource>
): CachedResourceValue<Input, Resource> {
  return defineCachedResourceLookup(definition);
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
    loadManyFromDatabase: async (inputs, transaction) => {
      // Legacy collection caches expose only single-key fetches: each key holds a whole list.
      assert(inputs.length === 1);
      return [await definition.loadFromDatabase(inputs[0], transaction)];
    },
  });

  return {
    fetch: async (input, transaction) =>
      (await lookup.fetch(input, transaction)) ?? [],
    invalidate: lookup.invalidate,
    invalidateMany: lookup.invalidateMany,
    createCacheOperations: lookup.createCacheOperations,
  };
}
