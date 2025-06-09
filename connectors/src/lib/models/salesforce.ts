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

export class SalesforceSyncedQueryModel extends ConnectorBaseModel<SalesforceSyncedQueryModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare rootNodeName: string;
  declare soql: string;
  declare lastSeenUpdatedAt: Date | null;
  declare titleTemplate: string;
  declare contentTemplate: string;
  declare tagsTemplate: string | null;
}
SalesforceSyncedQueryModel.init(
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
    rootNodeName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    soql: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    titleTemplate: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    contentTemplate: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    tagsTemplate: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    lastSeenUpdatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "salesforce_synced_queries",
    indexes: [{ fields: ["connectorId"], unique: false }],
  }
);
