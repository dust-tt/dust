import { connectorsSequelize } from "@connectors/resources/storage";
import { DataTypes } from "@connectors/resources/storage/data_types";
import { ConnectorBaseModel } from "@connectors/resources/storage/wrappers/model_with_connectors";
import type { CreationOptional } from "sequelize";

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
    // Last successful dust_project Temporal workflow (conversations + metadata); not conversation-only.
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
  /** 1 = monolithic document id; N > 1 = base-part-1 … base-part-N. Null for rows synced before this column existed. */
  declare documentPartCount: CreationOptional<number | null>;
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
    documentPartCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize: connectorsSequelize,
    indexes: [
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

export class DustProjectMountFileModel extends ConnectorBaseModel<DustProjectMountFileModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare projectId: string;
  /** Scoped mount path from Front list API (e.g. `project/report.pdf`). */
  declare scopedPath: string;
  /** Core document id used for upsert/delete. */
  declare documentId: string;
  declare sourceUpdatedAt: Date;
}

DustProjectMountFileModel.init(
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
    },
    scopedPath: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    documentId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sourceUpdatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize: connectorsSequelize,
    indexes: [
      { fields: ["connectorId", "scopedPath"], unique: true },
      { fields: ["connectorId", "sourceUpdatedAt"] },
      {
        fields: ["connectorId", "projectId", "scopedPath"],
        name: "dust_project_mount_files_connector_project_scoped",
      },
    ],
    modelName: "dust_project_mount_files",
    relationship: "hasMany",
  }
);
