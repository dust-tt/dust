import type {
  ForeignKey,
  InitOptions,
  Model,
  ModelAttributes,
  ModelStatic,
  NonAttribute,
} from "sequelize";
import { DataTypes } from "sequelize";

import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import { BaseModel } from "@connectors/resources/storage/wrappers/base";

export class ConnectorBaseModel<M extends Model> extends BaseModel<M> {
  declare connectorId: ForeignKey<ConnectorModel["id"]>;
  declare connector: NonAttribute<ConnectorModel>;

  static override init<MS extends ModelStatic<Model>>(
    this: MS,
    attributes: ModelAttributes<InstanceType<MS>>,
    options: InitOptions<InstanceType<MS>> & {
      relationship?: "hasMany" | "hasOne";
    }
  ): MS {
    const attrs = {
      ...attributes,
      connectorId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
          model: ConnectorModel.name,
          key: "id",
        },
      },
    };

    const { relationship = "hasMany", ...restOptions } = options;
    const model = super.init(attrs, restOptions);

    if (relationship === "hasOne") {
      ConnectorModel.hasOne(model, {
        foreignKey: { allowNull: false },
        onDelete: "RESTRICT",
      });
    } else {
      ConnectorModel.hasMany(model, {
        foreignKey: { allowNull: false },
        onDelete: "RESTRICT",
      });
    }

    model.belongsTo(ConnectorModel, {
      foreignKey: { allowNull: false },
    });

    return model;
  }
}
