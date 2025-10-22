import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import { connectorsSequelize } from "@connectors/resources/storage";
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
    sequelize: connectorsSequelize,
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
  declare lastSeenModifiedDate: Date | null;
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
      type: DataTypes.TEXT,
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
    lastSeenModifiedDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize: connectorsSequelize,
    modelName: "salesforce_synced_queries",
    indexes: [{ fields: ["connectorId"], unique: false }],
  }
);
