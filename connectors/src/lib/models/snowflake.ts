import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import { BaseModel } from "@connectors/resources/storage/wrappers/base";

export class SnowflakeConfigurationModel extends BaseModel<SnowflakeConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare connectorId: ForeignKey<ConnectorModel["id"]>;
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
    sequelize: sequelizeConnection,
    modelName: "snowflake_configurations",
    indexes: [{ fields: ["connectorId"], unique: true }],
  }
);
ConnectorModel.hasMany(SnowflakeConfigurationModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
SnowflakeConfigurationModel.belongsTo(ConnectorModel);
