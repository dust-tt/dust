import type { LightMCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

/**
 * Stores MCP tool calls originating from inside the sandbox that require user
 * approval. Unlike AgentMCPActionModel, this table has no stepContentId FK —
 * sandbox tool calls are NOT agent reasoning steps and don't need a
 * corresponding AgentStepContent record.
 */
export class SandboxMCPActionModel extends WorkspaceAwareModel<SandboxMCPActionModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentMessageId: ForeignKey<AgentMessageModel["id"]>;
  declare step: number;
  declare status: ToolExecutionStatus;
  declare mcpServerConfigurationId: string;
  declare toolConfiguration: LightMCPToolConfigurationType;
  declare augmentedInputs: Record<string, unknown>;

  declare agentMessage?: NonAttribute<AgentMessageModel>;
}

SandboxMCPActionModel.init(
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
    step: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "blocked_validation_required",
    },
    mcpServerConfigurationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    toolConfiguration: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    augmentedInputs: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    modelName: "sandbox_mcp_action",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "agentMessageId", "status"],
        name: "sandbox_mcp_action_ws_msg_status",
        concurrently: true,
      },
      {
        fields: ["agentMessageId"],
        name: "sandbox_mcp_actions_agent_message_id",
        concurrently: true,
      },
    ],
  }
);

SandboxMCPActionModel.belongsTo(AgentMessageModel, {
  foreignKey: { name: "agentMessageId", allowNull: false },
  as: "agentMessage",
});

AgentMessageModel.hasMany(SandboxMCPActionModel, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});
