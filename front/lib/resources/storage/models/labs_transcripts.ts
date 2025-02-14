import type { LabsTranscriptsProviderType } from "@dust-tt/types";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import type { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class LabsTranscriptsConfigurationModel extends WorkspaceAwareModel<LabsTranscriptsConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare connectionId: string | null;
  declare provider: LabsTranscriptsProviderType;
  declare agentConfigurationId: ForeignKey<AgentConfiguration["sId"]> | null;
  declare isActive: boolean;

  declare isDefaultWorkspaceConfiguration: boolean; // For default provider
  declare isDefaultFullStorage: boolean;

  declare userId: ForeignKey<UserModel["id"]>;
  declare dataSourceViewId: ForeignKey<DataSourceViewModel["id"]> | null;
  declare credentialId: string | null;
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
    isDefaultFullStorage: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    credentialId: {
      type: DataTypes.STRING,
      allowNull: true,
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
      {
        fields: ["fileId", "configurationId"],
        unique: true,
        name: "labs_transcripts_histories_file_configuration_id",
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
