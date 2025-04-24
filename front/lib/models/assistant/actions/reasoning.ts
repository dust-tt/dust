import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
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

  // If we have an agentConfigurationId, it means that the agent has the reasoning tool.
  declare agentConfigurationId: ForeignKey<AgentConfiguration["id"]> | null;
  // If we have a mcpServerConfigurationId, it means that the MCP server is configured with a reasoning model.
  declare mcpServerConfigurationId: ForeignKey<
    AgentMCPServerConfiguration["id"]
  > | null;

  declare sId: string;

  declare name: string | null;
  declare description: string | null;
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
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
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
        fields: ["agentConfigurationId"],
        concurrently: true,
      },
    ],
    sequelize: frontSequelize,
  }
);

AgentConfiguration.hasMany(AgentReasoningConfiguration, {
  foreignKey: { name: "agentConfigurationId", allowNull: true },
  onDelete: "RESTRICT",
});
AgentReasoningConfiguration.belongsTo(AgentConfiguration, {
  foreignKey: { name: "agentConfigurationId", allowNull: true },
  onDelete: "RESTRICT",
});

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
      {
        fields: ["agentMessageId"],
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
