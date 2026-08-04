import { DataTypes, Op } from "@app/lib/resources/storage/data_types";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { BaseModel } from "@app/lib/resources/storage/wrappers/base";
import logger from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";
import type {
  Attributes,
  CountWithOptions,
  CreationOptional,
  DestroyOptions,
  Filterable,
  FindOptions,
  ForeignKey,
  GroupedCountResultItem,
  InferAttributes,
  InitOptions,
  Model,
  ModelAttributes,
  ModelStatic,
  NonAttribute,
  UpdateOptions,
  WhereOptions,
} from "sequelize";
import type { ModelHooks } from "sequelize/lib/hooks";

// Log only 1 time out of 100 on average.
const WORKSPACE_ISOLATION_SAMPLING_RATE = 0.01;

// Helper type and type guard for workspaceId check.
type WhereClauseWithNumericWorkspaceId<TAttributes> =
  WhereOptions<TAttributes> & {
    workspaceId: number | [number];
  };

function isWhereClauseWithNumericWorkspaceId<TAttributes>(
  where: WhereOptions<TAttributes> | undefined
): where is WhereClauseWithNumericWorkspaceId<TAttributes> {
  if (!where) {
    return false;
  }

  if (!("workspaceId" in where)) {
    return false;
  }

  const { workspaceId } = where;

  // Accept a direct numeric workspaceId.
  if (typeof workspaceId === "number") {
    return true;
  }

  // Accept an array with exactly one numeric element.
  if (
    Array.isArray(workspaceId) &&
    workspaceId.length === 1 &&
    typeof workspaceId[0] === "number"
  ) {
    return true;
  }

  return false;
}

// TODO(2025-12-22): Remove this temporary bypass list after refactoring all models to
// properly use workspace isolation.
const TEMPORARY_WHITELISTED_MODELS_FOR_WORKSPACE_ISOLATION_BYPASS = [
  "subscription",
];

// Define a custom FindOptions extension with the skipWorkspaceCheck flag.
interface WorkspaceTenantIsolationSecurityBypassOptions<T>
  extends FindOptions<T> {
  /**
   * When true, BYPASSES CRITICAL TENANT ISOLATION SECURITY for this query.
   *
   * SECURITY REQUIREMENT: You MUST include a comment explaining why this security bypass
   * is necessary using the format:
   * // WORKSPACE_ISOLATION_BYPASS: [explanation]
   *
   * This should only be used in critical scenarios where a query legitimately needs
   * to operate across workspaces or without workspace context.
   */
  dangerouslyBypassWorkspaceIsolationSecurity?: boolean;
}

function checkWorkspaceIsolation<MS extends ModelStatic<Model>>(
  options: Filterable<InferAttributes<InstanceType<MS>>>,
  {
    modelName,
    queryType,
  }: {
    modelName: string;
    queryType: "find" | "bulkDestroy";
  }
) {
  // Skip validation if specifically requested for this query.
  if (isWorkspaceIsolationBypassEnabled(options)) {
    return;
  }

  const whereClause = options.where;

  if (
    !isWhereClauseWithNumericWorkspaceId<InferAttributes<InstanceType<MS>>>(
      whereClause
    )
  ) {
    const stack = new Error().stack;

    if (
      // Do not rely on `isDevelopment` since we want to run this check everywhere except
      // production.
      process.env.NODE_ENV !== "production" &&
      !TEMPORARY_WHITELISTED_MODELS_FOR_WORKSPACE_ISOLATION_BYPASS.includes(
        modelName
      )
    ) {
      throw new Error(
        `Query attempted without workspaceId on ${modelName}. All workspace-aware model ` +
          "queries must be scoped to a specific workspaceId for query isolation. " +
          "See Runbook https://www.notion.so/dust-tt/Runbook-WorkspaceAwareModel-Workspace-Isolation-Enforcement-2d128599d94180dbbbace7cffcd958f6"
      );
    }

    if (Math.random() > WORKSPACE_ISOLATION_SAMPLING_RATE) {
      logger.warn(
        {
          model: modelName,
          query_type: queryType,
          stack_trace: stack,
          error: {
            message: "workspace_isolation_violation",
            stack,
          },
          where: whereClause,
        },
        "workspace_isolation_violation"
      );
    }
  }
}

function isWorkspaceIsolationBypassEnabled<T>(
  options: FindOptions<T>
): options is WorkspaceTenantIsolationSecurityBypassOptions<T> {
  return (
    "dangerouslyBypassWorkspaceIsolationSecurity" in options &&
    options.dangerouslyBypassWorkspaceIsolationSecurity === true
  );
}

// Number of rows deleted per statement by `destroyForWorkspaceInBatches`. Deleting 1_000 rows by
// primary key stays in the low-millisecond range while keeping round-trips bounded.
const DESTROY_FOR_WORKSPACE_BATCH_SIZE = 1_000;

// Minimal row shape accepted by `destroyForWorkspaceInBatches`. Using a concrete model type
// instead of a generic keeps the workspace scoping type-checked without unsafe casts.
type WorkspaceScopedModel = Model & {
  id: ModelId;
  workspaceId: ModelId | null;
};

/**
 * Delete all rows of a workspace-scoped table for a given workspace in small batches instead of
 * a single unbounded `DELETE ... WHERE "workspaceId" = X`.
 *
 * A single-statement delete on a large table can hold a transaction open for a long time, which
 * blocks `CREATE INDEX CONCURRENTLY` statements run by concurrent migrations. Each iteration here
 * selects a bounded batch of ids and deletes them in a short-lived statement, so locks are never
 * held for long.
 *
 * Works on any model with a numeric `id` primary key and a `workspaceId` column (both
 * `WorkspaceAwareModel` and plain `BaseModel` tables that carry a `workspaceId`). For
 * `SoftDeletableWorkspaceAwareModel` tables, this performs a hard delete of all rows, including
 * already soft-deleted ones.
 *
 * Returns the total number of rows deleted.
 */
export async function destroyForWorkspaceInBatches(
  model: ModelStatic<WorkspaceScopedModel>,
  {
    workspaceId,
    batchSize = DESTROY_FOR_WORKSPACE_BATCH_SIZE,
  }: {
    workspaceId: ModelId;
    batchSize?: number;
  }
): Promise<number> {
  let totalDeleted = 0;
  let rowCount = 0;

  do {
    // Select a bounded batch of ids first, then delete by id. The select is intentionally
    // unordered: each batch is deleted before the next select, so any rows will do, and an
    // ORDER BY would force a top-N sort on tables without a (workspaceId, id) index.
    // `includeDeleted` gives hard-delete semantics on soft-deletable models (soft-deleted rows
    // are swept too); it is ignored by non-soft-deletable models.
    const findOptions: WithIncludeDeleted<
      FindOptions<Attributes<WorkspaceScopedModel>>
    > = {
      attributes: ["id"],
      where: { workspaceId },
      limit: batchSize,
      includeDeleted: true,
    };
    const rows = await model.findAll(findOptions);
    rowCount = rows.length;

    if (rowCount === 0) {
      break;
    }

    // `hardDelete` gives hard-delete semantics on soft-deletable models; it is ignored by
    // non-soft-deletable models.
    const destroyOptions: WithHardDelete<
      DestroyOptions<Attributes<WorkspaceScopedModel>>
    > = {
      where: {
        id: { [Op.in]: rows.map((r) => r.id) },
        workspaceId,
      },
      hardDelete: true,
    };
    totalDeleted += await model.destroy(destroyOptions);
  } while (rowCount === batchSize);

  return totalDeleted;
}

export class WorkspaceAwareModel<M extends Model = any> extends BaseModel<M> {
  declare workspaceId: ForeignKey<WorkspaceModel["id"]>;
  declare workspace: NonAttribute<WorkspaceModel>;

  static override init<MS extends ModelStatic<Model>>(
    this: MS,
    attributes: ModelAttributes<InstanceType<MS>>,
    options: InitOptions<InstanceType<MS>> & {
      relationship?: "hasMany" | "hasOne";
      softDeletable?: boolean;
    }
  ): MS {
    const attrs = {
      ...attributes,
      workspaceId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
          model: WorkspaceModel.tableName,
          key: "id",
        },
      },
    };

    const { relationship = "hasMany", ...restOptions } = options;

    // Define a hook to ensure all find queries are properly scoped to a workspace.
    const hooks: Partial<
      ModelHooks<InstanceType<MS>, Attributes<InstanceType<MS>>>
    > = {
      beforeFind: (options: FindOptions<InferAttributes<InstanceType<MS>>>) => {
        checkWorkspaceIsolation(options, {
          modelName: this.name,
          queryType: "find",
        });
      },
      beforeBulkDestroy: (
        options: DestroyOptions<InferAttributes<InstanceType<MS>>>
      ) => {
        checkWorkspaceIsolation(options, {
          modelName: this.name,
          queryType: "bulkDestroy",
        });
      },
      ...(restOptions.hooks ?? {}),
    };

    const model = super.init(attrs, {
      ...restOptions,
      hooks,
    });

    if (relationship === "hasOne") {
      WorkspaceModel.hasOne(model, {
        foreignKey: { allowNull: false },
        onDelete: "RESTRICT",
      });
    } else {
      WorkspaceModel.hasMany(model, {
        foreignKey: { allowNull: false },
        onDelete: "RESTRICT",
      });
    }

    model.belongsTo(WorkspaceModel, {
      foreignKey: { allowNull: false },
    });

    return model;
  }

  public override reload(options?: FindOptions<Attributes<M>>): Promise<this> {
    const optionsWithBypass: WorkspaceTenantIsolationSecurityBypassOptions<
      Attributes<M>
    > = {
      ...options,
      // WORKSPACE_ISOLATION_BYPASS: Reloading an instance does not require workspace isolation.
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    };
    return super.reload(optionsWithBypass);
  }
}

export type ModelStaticWorkspaceAware<M extends WorkspaceAwareModel> =
  ModelStatic<M> & {
    findAll(
      options: WorkspaceTenantIsolationSecurityBypassOptions<Attributes<M>>
    ): Promise<M[]>;
    findOne(
      options: WorkspaceTenantIsolationSecurityBypassOptions<Attributes<M>>
    ): Promise<M | null>;
    findByPk(
      identifier: any,
      options: WorkspaceTenantIsolationSecurityBypassOptions<Attributes<M>>
    ): Promise<M | null>;
    findAndCountAll(
      options: WorkspaceTenantIsolationSecurityBypassOptions<Attributes<M>>
    ): Promise<{ rows: M[]; count: number }>;
  };
export type ModelStaticSoftDeletable<
  M extends SoftDeletableWorkspaceAwareModel,
> = ModelStatic<M> & {
  destroy(
    options: WithHardDelete<DestroyOptions<Attributes<M>>>
  ): Promise<number>;
  findAll(
    options: WithIncludeDeleted<
      WorkspaceTenantIsolationSecurityBypassOptions<Attributes<M>>
    >
  ): Promise<M[]>;
  findOne(
    options: WithIncludeDeleted<
      WorkspaceTenantIsolationSecurityBypassOptions<Attributes<M>>
    >
  ): Promise<M | null>;
  findByPk(
    identifier: any,
    options: WithIncludeDeleted<
      WorkspaceTenantIsolationSecurityBypassOptions<Attributes<M>>
    >
  ): Promise<M | null>;
};

type WithHardDelete<T> = T & {
  hardDelete: boolean;
};

type WithIncludeDeleted<T> = T & {
  includeDeleted?: boolean;
};

/**
 * The `SoftDeletableModel` class extends Sequelize's `Model` to implement custom soft delete
 * functionality. This class overrides certain static methods to provide a mechanism for marking
 * records as deleted without physically removing them from the database. The `deletedAt` field is
 * used to track when a record is soft deleted.
 *
 * Key Features:
 * - **Soft Delete:** The `destroy` method is overridden to perform a soft delete by default, setting
 *   the `deletedAt` field to the current date and time. A hard delete can be triggered by passing the
 *   `hardDelete` option.
 * - **Filtering Deleted Records:** The `findAll`, `findOne`, and `count` methods are overridden to
 *   exclude soft-deleted records by default. The `includeDeleted` option can be used to include these
 *   records in queries.
 * - **No Instance Method Override Needed:** Instance methods are not overridden as Sequelize utilizes
 *   the static methods internally, making this implementation efficient and seamless for
 *   instance-specific operations.
 *
 * Usage:
 * Extend this class for models that require soft delete functionality. The `deletedAt` field
 * is automatically declared and managed by this class.
 */
export class SoftDeletableWorkspaceAwareModel<
  M extends Model = any,
> extends WorkspaceAwareModel<M> {
  declare deletedAt: CreationOptional<Date | null>;

  // Delete.

  private static async softDelete<M extends Model>(
    this: ModelStatic<M>,
    options: DestroyOptions<Attributes<M>>
  ): Promise<number> {
    const updateOptions: UpdateOptions<Attributes<M>> = {
      ...options,
      fields: ["deletedAt"],
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      where: options?.where || {},
    };

    const [affectedCount] = await this.update(
      { deletedAt: new Date() },
      updateOptions
    );

    return affectedCount;
  }

  public static override async destroy<M extends Model>(
    this: ModelStatic<M>,
    options: WithHardDelete<DestroyOptions<Attributes<M>>>
  ): Promise<number> {
    if (options.hardDelete) {
      return super.destroy(options);
    }

    return SoftDeletableWorkspaceAwareModel.softDelete.call(this, options);
  }

  // Fetch.

  public static override async findAll<M extends Model>(
    this: ModelStatic<M>,
    options?: WithIncludeDeleted<FindOptions<Attributes<M>>>
  ): Promise<M[]> {
    if (options?.includeDeleted) {
      return super.findAll<M>(options) as Promise<M[]>;
    }

    const whereClause = {
      ...options?.where,
      deletedAt: {
        [Op.is]: null,
      },
    } as WhereOptions<Attributes<M>>;

    return super.findAll<M>({
      ...options,
      where: whereClause,
    }) as Promise<M[]>;
  }

  public static override async findOne<M extends Model>(
    this: ModelStatic<M>,
    options?: WithIncludeDeleted<FindOptions<Attributes<M>>>
  ): Promise<M | null> {
    if (options?.includeDeleted) {
      return super.findOne(options) as Promise<M | null>;
    }

    const whereClause = {
      ...options?.where,
      deletedAt: {
        [Op.is]: null,
      },
    } as WhereOptions<Attributes<M>>;

    return super.findOne({
      ...options,
      where: whereClause,
    }) as Promise<M | null>;
  }

  public static override count(options?: CountWithOptions): Promise<number>;
  public static override count(
    options: CountWithOptions & { group: unknown }
  ): Promise<GroupedCountResultItem[]>;
  public static override async count<M extends Model>(
    options?: WithIncludeDeleted<CountWithOptions>
  ): Promise<number | GroupedCountResultItem[]> {
    if (options?.includeDeleted) {
      return super.count(options);
    }

    const whereClause: WhereOptions<M & any> = {
      ...options?.where,
      deletedAt: {
        [Op.is]: null,
      },
    };

    return super.count({
      ...options,
      where: whereClause,
    });
  }
}
