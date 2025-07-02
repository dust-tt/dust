import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ModelIdType, ModelProviderIdType } from "@app/types";
import type { AgentReasoningEffort } from "@app/types";

export class AgentReasoningConfiguration extends WorkspaceAwareModel<AgentReasoningConfiguration> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare providerId: ModelProviderIdType;
  declare modelId: ModelIdType;
  declare temperature: number | null;
  declare reasoningEffort: AgentReasoningEffort | null;

  declare mcpServerConfigurationId: ForeignKey<
    AgentMCPServerConfiguration["id"]
  > | null;

  declare sId: string;
}

AgentReasoningConfiguration.init(
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
    providerId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    modelId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    temperature: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    reasoningEffort: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "agent_reasoning_configuration",
    indexes: [
      {
        unique: true,
        fields: ["sId"],
      },
      {
        fields: ["workspaceId", "mcpServerConfigurationId"],
        name: "agent_reasoning_config_workspace_id_mcp_srv_config_id",
        concurrently: true,
      },
    ],
    sequelize: frontSequelize,
  }
);

AgentMCPServerConfiguration.hasMany(AgentReasoningConfiguration, {
  foreignKey: { name: "mcpServerConfigurationId", allowNull: true },
  onDelete: "RESTRICT",
});
AgentReasoningConfiguration.belongsTo(AgentMCPServerConfiguration, {
  foreignKey: { name: "mcpServerConfigurationId", allowNull: true },
  onDelete: "RESTRICT",
});

export class AgentReasoningAction extends WorkspaceAwareModel<AgentReasoningAction> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare runId: string | null;

  declare reasoningConfigurationId: string;

  declare output: string | null;
  declare thinking: string | null;

  declare functionCallId: string | null;
  declare functionCallName: string | null;

  declare step: number;
  declare agentMessageId: ForeignKey<AgentMessage["id"]>;
}

AgentReasoningAction.init(
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

    reasoningConfigurationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    thinking: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    output: {
      type: DataTypes.TEXT,
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
  },
  {
    modelName: "agent_reasoning_action",
    sequelize: frontSequelize,
    indexes: [
      // TODO(WORKSPACE_ID_ISOLATION 2025-05-12): Remove index
      {
        fields: ["agentMessageId"],
        concurrently: true,
      },
      {
        fields: ["workspaceId", "agentMessageId"],
        concurrently: true,
      },
    ],
  }
);

AgentReasoningAction.belongsTo(AgentMessage, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});

AgentMessage.hasMany(AgentReasoningAction, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});
