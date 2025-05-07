import type {
  Attributes,
  CountWithOptions,
  CreationOptional,
  DestroyOptions,
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
import { DataTypes, Op } from "sequelize";

import { Workspace } from "@app/lib/models/workspace";
import { BaseModel } from "@app/lib/resources/storage/wrappers/base";
import logger from "@app/logger/logger";

// Helper type and type guard for workspaceId check.
type WhereClauseWithNumericWorkspaceId<TAttributes> =
  WhereOptions<TAttributes> & {
    workspaceId: number;
  };

function isWhereClauseWithNumericWorkspaceId<TAttributes>(
  where: WhereOptions<TAttributes> | undefined
): where is WhereClauseWithNumericWorkspaceId<TAttributes> {
  if (!where) {
    return false;
  }

  return (
    typeof where === "object" &&
    !Array.isArray(where) &&
    "workspaceId" in where &&
    typeof where.workspaceId === "number"
  );
}

export class WorkspaceAwareModel<M extends Model> extends BaseModel<M> {
  declare workspaceId: ForeignKey<Workspace["id"]>;
  declare workspace: NonAttribute<Workspace>;

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
          model: Workspace.tableName,
          key: "id",
        },
      },
    };

    const { relationship = "hasMany", ...restOptions } = options;

    // Define a hook to ensure all find queries are properly scoped to a workspace.
    const hooks = {
      beforeFind: (options: FindOptions<InferAttributes<InstanceType<MS>>>) => {
        const whereClause = options.where;

        if (
          !isWhereClauseWithNumericWorkspaceId<
            InferAttributes<InstanceType<MS>>
          >(whereClause)
        ) {
          const stack = new Error().stack;

          logger.warn(
            {
              model: this.name,
              query_type: "find",
              stack_trace: stack,
              where: whereClause,
            },
            "workspace_isolation_violation"
          );

          // TODO: Uncomment this once we've updated all queries to include `workspaceId`.
          // if (process.env.NODE_ENV === "development") {
          //   throw new Error(
          //     `Query attempted without workspaceId on ${this.name}`
          //   );
          // }
        }
      },
      ...(restOptions.hooks || {}),
    };

    const model = super.init(attrs, {
      ...restOptions,
      hooks,
    });

    if (relationship === "hasOne") {
      Workspace.hasOne(model, {
        foreignKey: { allowNull: false },
        onDelete: "RESTRICT",
      });
    } else {
      Workspace.hasMany(model, {
        foreignKey: { allowNull: false },
        onDelete: "RESTRICT",
      });
    }

    model.belongsTo(Workspace, {
      foreignKey: { allowNull: false },
    });

    return model;
  }
}

export type ModelStaticSoftDeletable<
  M extends SoftDeletableWorkspaceAwareModel,
> = ModelStatic<M> & {
  findAll(
    options: WithIncludeDeleted<FindOptions<Attributes<M>>>
  ): Promise<M[]>;
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
    options: DestroyOptions<Attributes<M>>
  ): Promise<number> {
    const updateOptions: UpdateOptions<Attributes<M>> = {
      ...options,
      fields: ["deletedAt"],
      where: options?.where || {},
    };

    const [affectedCount] = await this.update(
      { deletedAt: new Date() },
      updateOptions
    );

    return affectedCount;
  }

  public static override async destroy<M extends Model>(
    options: WithHardDelete<DestroyOptions<Attributes<M>>>
  ): Promise<number> {
    if (options.hardDelete) {
      return super.destroy(options);
    }

    return this.softDelete(options);
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
