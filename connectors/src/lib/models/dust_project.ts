import { connectorsSequelize } from "@connectors/resources/storage";
import { ConnectorBaseModel } from "@connectors/resources/storage/wrappers/model_with_connectors";
import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

export class DustProjectConfigurationModel extends ConnectorBaseModel<DustProjectConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare projectId: string;
  declare lastSyncedAt: CreationOptional<Date | null>;
}

DustProjectConfigurationModel.init(
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
    projectId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    lastSyncedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize: connectorsSequelize,
    indexes: [
      { fields: ["connectorId"], unique: true },
      { fields: ["projectId"], unique: true },
    ],
    modelName: "dust_project_configurations",
    relationship: "hasOne",
  }
);

export class DustProjectConversationModel extends ConnectorBaseModel<DustProjectConversationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare conversationId: string;
  declare projectId: string;
  declare lastSyncedAt: CreationOptional<Date | null>;
  declare sourceUpdatedAt: Date;
}

DustProjectConversationModel.init(
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
    conversationId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    projectId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastSyncedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    sourceUpdatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize: connectorsSequelize,
    indexes: [
      { fields: ["conversationId"], unique: true },
      { fields: ["connectorId", "conversationId"], unique: true },
      { fields: ["connectorId", "sourceUpdatedAt"] },
      {
        fields: ["connectorId", "projectId", "conversationId"],
        name: "dust_project_conversations_connector_id_project_id_conversation",
      },
    ],
    modelName: "dust_project_conversations",
    relationship: "hasMany",
  }
);
