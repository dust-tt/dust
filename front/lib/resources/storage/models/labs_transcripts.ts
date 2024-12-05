import type { LabsTranscriptsProviderType } from "@dust-tt/types";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import type { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { BaseModel } from "@app/lib/resources/storage/wrappers";

export class LabsTranscriptsConfigurationModel extends BaseModel<LabsTranscriptsConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare connectionId: string;
  declare provider: LabsTranscriptsProviderType;
  declare agentConfigurationId: ForeignKey<AgentConfiguration["sId"]> | null;
  declare isActive: boolean;
  declare isDefaultFullStorage: boolean;

  declare userId: ForeignKey<UserModel["id"]>;
  declare workspaceId: ForeignKey<Workspace["id"]>;
  declare dataSourceViewId: ForeignKey<DataSourceViewModel["id"]> | null;
  declare apiKey: string | null;
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
      allowNull: false,
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
    isDefaultFullStorage: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    apiKey: {
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
    ],
  }
);

UserModel.hasMany(LabsTranscriptsConfigurationModel, {
  foreignKey: { name: "userId", allowNull: false },
});
LabsTranscriptsConfigurationModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: false },
});

Workspace.hasMany(LabsTranscriptsConfigurationModel, {
  foreignKey: { name: "workspaceId", allowNull: false },
  onDelete: "CASCADE",
});
LabsTranscriptsConfigurationModel.belongsTo(Workspace, {
  foreignKey: { name: "workspaceId", allowNull: false },
});

DataSourceViewModel.hasMany(LabsTranscriptsConfigurationModel, {
  foreignKey: { name: "dataSourceViewId", allowNull: true },
});
LabsTranscriptsConfigurationModel.belongsTo(DataSourceViewModel, {
  as: "dataSourceView",
  foreignKey: { name: "dataSourceViewId", allowNull: true },
});

export class LabsTranscriptsHistoryModel extends BaseModel<LabsTranscriptsHistoryModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare fileId: string;
  declare fileName: string;

  declare conversationId: string | null;

  declare configurationId: ForeignKey<LabsTranscriptsConfigurationModel["id"]>;

  declare configuration: NonAttribute<LabsTranscriptsConfigurationModel>;
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
