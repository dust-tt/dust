import type {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
  InitOptions,
  ModelAttributes,
  ModelStatic,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

interface BaseModelAttributes {
  id?: {
    type: typeof DataTypes.BIGINT;
    primaryKey?: boolean;
    autoIncrement?: boolean;
  };
}

/**
 * A wrapper class that enforces BIGINT for all model primary keys.
 * All models should extend this class instead of Sequelize's Model.
 */
export class BaseModel<M extends Model> extends Model<
  InferAttributes<M>,
  InferCreationAttributes<M>
> {
  declare id: CreationOptional<number>;

  static override init<MS extends ModelStatic<Model>>(
    this: MS,
    attributes: ModelAttributes<InstanceType<MS>> & BaseModelAttributes,
    options: InitOptions<InstanceType<MS>>
  ): MS {
    const attrs: ModelAttributes<InstanceType<MS>> & BaseModelAttributes = {
      ...attributes,
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        ...("id" in attributes
          ? {
              autoIncrement: attributes.id?.autoIncrement ?? true,
              primaryKey: attributes.id?.primaryKey ?? true,
            }
          : {}),
      },
    };

    return super.init(attrs, options) as MS;
  }
}
