import {
  Attributes,
  CountWithOptions,
  CreationOptional,
  DestroyOptions,
  FindOptions,
  GroupedCountResultItem,
  InferAttributes,
  InferCreationAttributes,
  Model,
  ModelStatic,
  NonNullFindOptions,
  Op,
  UpdateOptions,
  WhereOptions,
} from "sequelize";

export type ModelStaticSoftDeletable<M extends SoftDeletableModel> =
  ModelStatic<M> & {
    findAll(
      options: WithIncludeDeleted<FindOptions<Attributes<M>>>
    ): Promise<M[]>;
  };

type WithHardDelete<T> = T & {
  hardDelete?: boolean;
};

type WithIncludeDeleted<T> = T & {
  includeDeleted?: boolean;
};

export class SoftDeletableModel<M extends Model = any> extends Model<
  InferAttributes<M>,
  InferCreationAttributes<M>
> {
  declare deletedAt: CreationOptional<Date | null>;

  // TODO: Update instance method?

  // Delete.

  private static async softDelete<M extends Model>(
    options: DestroyOptions<Attributes<M>>
  ): Promise<number> {
    console.log(">> Custom soft delete <<");

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
    console.log(">> Attempt to destroy a SoftDeletable model");

    if (options.hardDelete) {
      console.log(">> Hard delete <<");
      return super.destroy(options);
    }

    return this.softDelete(options);
  }

  // Fetch.

  public static override async findAll<M extends Model>(
    this: ModelStatic<M>,
    options?: WithIncludeDeleted<FindOptions<Attributes<M>>>
  ): Promise<M[]> {
    console.log(">> Custom findAll <<");

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
    console.log(">> Custom findOne <<");

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
    console.log(">> Custom count <<");

    if (options?.includeDeleted) {
      const { includeDeleted, ...sequelizeOptions } = options;
      return super.count(sequelizeOptions);
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
