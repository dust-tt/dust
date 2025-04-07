import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { LabsConnectionType } from "@app/types";
import { labsConnections, SyncStatus } from "@app/types";

export class LabsConnectionsConfigurationModel extends WorkspaceAwareModel<LabsConnectionsConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: string;
  declare provider: LabsConnectionType;
  declare isEnabled: boolean;

  declare userId: ForeignKey<UserModel["id"]>;
  declare dataSourceViewId: ForeignKey<DataSourceViewModel["id"]> | null; // Dust folder storage
  declare connectionId: string | null; // OAuth based auth
  declare credentialId: string | null; // API key based auth

  declare syncStatus: SyncStatus;
  declare lastSyncStartedAt: Date | null;
  declare lastSyncCompletedAt: Date | null;
  declare lastSyncError: string | null;
  declare lastSyncCursor: string | null;
}

LabsConnectionsConfigurationModel.init(
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
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    provider: {
      type: DataTypes.ENUM(...labsConnections),
      allowNull: false,
    },
    isEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    connectionId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    credentialId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    syncInterval: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    syncConfig: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    syncStatus: {
      type: DataTypes.ENUM(...Object.values(SyncStatus)),
      allowNull: false,
      defaultValue: SyncStatus.IDLE,
    },
    lastSyncStartedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastSyncCompletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastSyncError: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    lastSyncCursor: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "labs_connections_configuration",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["userId"] },
      { fields: ["userId", "workspaceId", "provider"], unique: true },
      { fields: ["dataSourceViewId"] },
      { fields: ["provider", "connectionStatus"] },
      { fields: ["syncStatus"] },
    ],
  }
);

UserModel.hasMany(LabsConnectionsConfigurationModel, {
  foreignKey: { name: "userId", allowNull: false },
});
LabsConnectionsConfigurationModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: false },
});

DataSourceViewModel.hasMany(LabsConnectionsConfigurationModel, {
  foreignKey: { name: "dataSourceViewId", allowNull: true },
});
LabsConnectionsConfigurationModel.belongsTo(DataSourceViewModel, {
  as: "dataSourceView",
  foreignKey: { name: "dataSourceViewId", allowNull: true },
});
