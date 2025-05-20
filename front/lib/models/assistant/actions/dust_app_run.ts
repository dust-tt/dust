import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import type { DustAppParameters } from "@app/lib/actions/dust_app_run";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class AgentDustAppRunConfiguration extends WorkspaceAwareModel<AgentDustAppRunConfiguration> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfigurationId: ForeignKey<AgentConfiguration["id"]>;

  declare sId: string;

  declare appWorkspaceId: string;
  declare appId: string;
}

AgentDustAppRunConfiguration.init(
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
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    appWorkspaceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    appId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "agent_dust_app_run_configuration",
    indexes: [
      {
        unique: true,
        fields: ["sId"],
      },
      // TODO(WORKSPACE_ID_ISOLATION 2025-05-13): Remove this index.
      {
        fields: ["agentConfigurationId"],
        concurrently: true,
      },
      {
        fields: ["workspaceId", "agentConfigurationId"],
        concurrently: true,
        name: "agent_dust_app_run_config_workspace_id_agent_config_id",
      },
    ],
    sequelize: frontSequelize,
  }
);

AgentConfiguration.hasMany(AgentDustAppRunConfiguration, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
});
AgentDustAppRunConfiguration.belongsTo(AgentConfiguration, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
});

/**
 * DustAppRun Action
 */
export class AgentDustAppRunAction extends WorkspaceAwareModel<AgentDustAppRunAction> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare runId: string | null;

  declare dustAppRunConfigurationId: string;

  declare appWorkspaceId: string;
  declare appId: string;
  declare appName: string;

  declare params: DustAppParameters;
  declare output: unknown | null;
  declare functionCallId: string | null;
  declare functionCallName: string | null;

  declare step: number;
  declare agentMessageId: ForeignKey<AgentMessage["id"]>;
  declare resultsFileId: ForeignKey<FileModel["id"]> | null;
  declare resultsFileSnippet: string | null;
  declare resultsFile: NonAttribute<FileModel>;
}

AgentDustAppRunAction.init(
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
    runId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    dustAppRunConfigurationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    appWorkspaceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    appId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    appName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    params: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    output: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    functionCallId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    functionCallName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    step: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    resultsFileSnippet: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    modelName: "agent_dust_app_run_action",
    sequelize: frontSequelize,
    indexes: [
      // TODO(WORKSPACE_ID_ISOLATION 2025-05-12): Remove this index.
      {
        fields: ["agentMessageId"],
      },
      {
        fields: ["resultsFileId"],
      },
      {
        fields: ["workspaceId", "agentMessageId"],
      },
    ],
  }
);

AgentDustAppRunAction.belongsTo(AgentMessage, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});

AgentMessage.hasMany(AgentDustAppRunAction, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});

FileModel.hasMany(AgentDustAppRunAction, {
  foreignKey: { name: "resultsFileId", allowNull: true },
  onDelete: "SET NULL",
});
AgentDustAppRunAction.belongsTo(FileModel, {
  as: "resultsFile",
  foreignKey: { name: "resultsFileId", allowNull: true },
  onDelete: "SET NULL",
});
