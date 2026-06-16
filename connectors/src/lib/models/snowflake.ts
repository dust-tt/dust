import { connectorsSequelize } from "@connectors/resources/storage";
import { DataTypes } from "@connectors/resources/storage/data_types";
import { ConnectorBaseModel } from "@connectors/resources/storage/wrappers/model_with_connectors";
import type { CreationOptional } from "sequelize";

export class SnowflakeConfigurationModel extends ConnectorBaseModel<SnowflakeConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
SnowflakeConfigurationModel.init(
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
  },
  {
    sequelize: connectorsSequelize,
    modelName: "snowflake_configurations",
    indexes: [{ fields: ["connectorId"], unique: true }],
  }
);
