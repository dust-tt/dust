import type { LightMCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import { AgentMCPActionModel } from "@app/lib/models/agent/actions/mcp";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

/**
 * Stores MCP tool executions originating from inside the sandbox that require
 * user approval. Unlike AgentMCPActionModel, this table has no stepContentId
 * FK — sandbox tool executions are NOT agent reasoning steps and don't need a
 * corresponding AgentStepContent record.
 *
 * Each row points to the parent `AgentMCPActionModel` (the agent's running
 * sandbox bash tool) via `agentMCPActionId`, so we can scan blocked children
 * directly under their parent without going through `agentMessageId`.
 */
export class SandboxToolExecutionModel extends WorkspaceAwareModel<SandboxToolExecutionModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentMessageId: ForeignKey<AgentMessageModel["id"]>;
  declare agentMCPActionId: ForeignKey<AgentMCPActionModel["id"]>;
  declare status: ToolExecutionStatus;
  declare mcpServerConfigurationId: string;
  declare toolConfiguration: LightMCPToolConfigurationType;
  declare augmentedInputs: Record<string, unknown>;

  declare agentMessage?: NonAttribute<AgentMessageModel>;
}

SandboxToolExecutionModel.init(
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
    status: {
      type: DataTypes.STRING,
      allowNull: false,
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
    modelName: "sandbox_tool_execution",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "agentMessageId", "status"],
        name: "sandbox_tool_execution_ws_msg_status",
        concurrently: true,
      },
      {
        fields: ["workspaceId", "agentMCPActionId", "status"],
        name: "sandbox_tool_execution_ws_action_status",
        concurrently: true,
      },
    ],
  }
);

SandboxToolExecutionModel.belongsTo(AgentMessageModel, {
  foreignKey: { name: "agentMessageId", allowNull: false },
  as: "agentMessage",
});

AgentMessageModel.hasMany(SandboxToolExecutionModel, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});

SandboxToolExecutionModel.belongsTo(AgentMCPActionModel, {
  foreignKey: { name: "agentMCPActionId", allowNull: false },
  as: "agentMCPAction",
});

AgentMCPActionModel.hasMany(SandboxToolExecutionModel, {
  foreignKey: { name: "agentMCPActionId", allowNull: false },
});
