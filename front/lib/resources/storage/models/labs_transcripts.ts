import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import type { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { LabsTranscriptsProviderType } from "@app/types";

export class LabsTranscriptsConfigurationModel extends WorkspaceAwareModel<LabsTranscriptsConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare connectionId: string | null;
  declare provider: LabsTranscriptsProviderType;
  declare agentConfigurationId: ForeignKey<
    AgentConfigurationModel["sId"]
  > | null;
  declare isActive: boolean;

  declare isDefaultWorkspaceConfiguration: boolean; // For default provider

  declare userId: ForeignKey<UserModel["id"]>;
  declare dataSourceViewId: ForeignKey<DataSourceViewModel["id"]> | null;
  declare credentialId: string | null;
  declare useConnectorConnection: boolean;
}

LabsTranscriptsConfigurationModel.init(
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
    connectionId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    provider: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    agentConfigurationId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    isDefaultWorkspaceConfiguration: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    credentialId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    useConnectorConnection: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    modelName: "labs_transcripts_configuration",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["userId"] },
      { fields: ["userId", "workspaceId"], unique: true },
      { fields: ["dataSourceViewId"] },
    ],
  }
);

UserModel.hasMany(LabsTranscriptsConfigurationModel, {
  foreignKey: { name: "userId", allowNull: false },
});
LabsTranscriptsConfigurationModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: false },
});

DataSourceViewModel.hasMany(LabsTranscriptsConfigurationModel, {
  foreignKey: { name: "dataSourceViewId", allowNull: true },
});
LabsTranscriptsConfigurationModel.belongsTo(DataSourceViewModel, {
  as: "dataSourceView",
  foreignKey: { name: "dataSourceViewId", allowNull: true },
});

export class LabsTranscriptsHistoryModel extends WorkspaceAwareModel<LabsTranscriptsHistoryModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare fileId: string;
  declare fileName: string;

  declare conversationId: string | null;

  declare configurationId: ForeignKey<LabsTranscriptsConfigurationModel["id"]>;

  declare configuration: NonAttribute<LabsTranscriptsConfigurationModel>;

  declare stored?: boolean;
}

LabsTranscriptsHistoryModel.init(
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
    fileId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    fileName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    conversationId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    stored: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    modelName: "labs_transcripts_history",
    sequelize: frontSequelize,
    indexes: [
      // TODO(WORKSPACE_ID_ISOLATION 2025-05-12): Remove this index.
      {
        fields: ["fileId", "configurationId"],
        unique: true,
        name: "labs_transcripts_histories_file_configuration_id",
      },
      {
        fields: ["workspaceId", "configurationId", "fileId"],
        unique: true,
        name: "labs_transcripts_histories_workspace_configuration_file_id",
      },
    ],
  }
);

LabsTranscriptsHistoryModel.belongsTo(LabsTranscriptsConfigurationModel, {
  as: "configuration",
  foreignKey: { name: "configurationId", allowNull: false },
});
LabsTranscriptsConfigurationModel.hasMany(LabsTranscriptsHistoryModel, {
  as: "configuration",
  foreignKey: { name: "configurationId", allowNull: false },
});
