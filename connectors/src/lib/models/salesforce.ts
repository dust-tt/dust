import { connectorsSequelize } from "@connectors/resources/storage";
import {
  DANGEROUSLY_UNBOUNDED_TEXT,
  DataTypes,
} from "@connectors/resources/storage/data_types";
import { ConnectorBaseModel } from "@connectors/resources/storage/wrappers/model_with_connectors";
import type { CreationOptional } from "sequelize";

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
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: false,
    },
    soql: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: false,
    },
    titleTemplate: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: false,
    },
    contentTemplate: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: false,
    },
    tagsTemplate: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
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
