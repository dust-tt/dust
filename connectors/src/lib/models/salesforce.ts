import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorBaseModel } from "@connectors/resources/storage/wrappers/model_with_connectors";

export class SalesforceConfigurationModel extends ConnectorBaseModel<SalesforceConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

SalesforceConfigurationModel.init(
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
    modelName: "salesforce_configurations",
    indexes: [{ fields: ["connectorId"], unique: true }],
    relationship: "hasOne",
  }
);
