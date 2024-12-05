import type {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
  InitOptions,
  ModelAttributes,
  ModelStatic,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

/**
 * A wrapper class that enforces BIGINT for all model primary keys.
 * All models should extend this class instead of Sequelize's Model.
 */
export class BaseModel<M extends Model = any> extends Model<
  InferAttributes<M>,
  InferCreationAttributes<M>
> {
  declare id: CreationOptional<number>;

  static override init<MS extends ModelStatic<Model>>(
    this: MS,
    attributes: ModelAttributes<InstanceType<MS>, any>,
    options: InitOptions<InstanceType<MS>>
  ): MS {
    const attrs = {
      ...attributes,
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        ...("id" in attributes
          ? {
              autoIncrement: (attributes as any).id?.autoIncrement ?? true,
              primaryKey: (attributes as any).id?.primaryKey ?? true,
            }
          : {}),
      },
    } as ModelAttributes<InstanceType<MS>, any>;

    return super.init(attrs, options) as MS;
  }
}
