import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorBaseModel } from "@connectors/resources/storage/wrappers/model_with_connectors";

export class GongConfigurationModel extends ConnectorBaseModel<GongConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare timestampCursor: number | null;
}

GongConfigurationModel.init(
  {
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    timestampCursor: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "gong_configurations",
    indexes: [{ fields: ["connectorId"], unique: true }],
    relationship: "hasOne",
  }
);
