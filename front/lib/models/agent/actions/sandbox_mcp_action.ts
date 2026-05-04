import type { LightMCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import { AgentMCPActionModel } from "@app/lib/models/agent/actions/mcp";
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
 *
 * Each row points to the parent `AgentMCPActionModel` (the agent's running
 * sandbox bash tool) via `agentMCPActionId`, so we can scan blocked children
 * directly under their parent without going through `agentMessageId`.
 */
export class SandboxMCPActionModel extends WorkspaceAwareModel<SandboxMCPActionModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentMessageId: ForeignKey<AgentMessageModel["id"]>;
  declare agentMCPActionId: ForeignKey<AgentMCPActionModel["id"]>;
  declare step: number;
  declare status: ToolExecutionStatus;
  declare mcpServerConfigurationId: string;
  declare toolConfiguration: LightMCPToolConfigurationType;
  declare augmentedInputs: Record<string, unknown>;

  declare agentMessage?: NonAttribute<AgentMessageModel>;
  declare agentMCPAction?: NonAttribute<AgentMCPActionModel>;
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
        fields: ["workspaceId", "agentMCPActionId", "status"],
        name: "sandbox_mcp_action_ws_action_status",
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

SandboxMCPActionModel.belongsTo(AgentMCPActionModel, {
  foreignKey: { name: "agentMCPActionId", allowNull: false },
  as: "agentMCPAction",
});

AgentMCPActionModel.hasMany(SandboxMCPActionModel, {
  foreignKey: { name: "agentMCPActionId", allowNull: false },
});
