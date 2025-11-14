import type { ConnectorProvider } from "@dust-tt/client";
import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import { connectorsSequelize } from "@connectors/resources/storage";
import { BaseModel } from "@connectors/resources/storage/wrappers/base";
import type {
  ConnectorErrorType,
  ConnectorSyncStatus,
} from "@connectors/types";

export interface ConnectorMetadata {
  rateLimited?: { at: Date } | null;
}

export class ConnectorModel extends BaseModel<ConnectorModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare type: ConnectorProvider;
  declare connectionId: string;
  declare useProxy: boolean | null;

  declare workspaceAPIKey: string;
  declare workspaceId: string;
  declare dataSourceId: string;

  declare lastSyncStatus?: ConnectorSyncStatus;
  declare errorType: ConnectorErrorType | null;
  declare lastSyncStartTime?: Date;
  declare lastSyncFinishTime?: Date;
  declare lastSyncSuccessfulTime?: Date | null;
  declare firstSuccessfulSyncTime?: Date;
  declare firstSyncProgress?: string;
  declare lastGCTime: Date | null;

  declare pausedAt?: Date | null;
  declare metadata: ConnectorMetadata | null;
}

ConnectorModel.init(
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
    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    connectionId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    useProxy: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    workspaceAPIKey: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    workspaceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dataSourceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastSyncStatus: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    errorType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    lastSyncStartTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastSyncFinishTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastSyncSuccessfulTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    firstSuccessfulSyncTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    firstSyncProgress: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    lastGCTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    pausedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize: connectorsSequelize,
    modelName: "connectors",
    indexes: [{ fields: ["workspaceId", "dataSourceId"], unique: true }],
  }
);
