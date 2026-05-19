import { AgentMCPActionModel } from "@app/lib/models/agent/actions/mcp";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import {
  AgentMessageModel,
  ConversationModel,
} from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

export class AgentStepContentToolExecutionModel extends WorkspaceAwareModel<AgentStepContentToolExecutionModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare conversationId: ForeignKey<ConversationModel["id"]>;
  declare agentMessageId: ForeignKey<AgentMessageModel["id"]>;

  declare agentMCPActionId: ForeignKey<AgentMCPActionModel["id"]>;
  declare stepContentId: ForeignKey<AgentStepContentModel["id"]>;

  declare agentMCPAction: NonAttribute<AgentMCPActionModel>;
  declare stepContent: NonAttribute<AgentStepContentModel>;
}

AgentStepContentToolExecutionModel.init(
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
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
    conversationId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    agentMessageId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    agentMCPActionId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    stepContentId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
  },
  {
    modelName: "agent_step_content_tool_execution",
    tableName: "agent_step_content_tool_executions",
    sequelize: frontSequelize,
    indexes: [
      // N:1 from action's side: each action has at most one stepContent.
      {
        unique: true,
        fields: ["workspaceId", "agentMCPActionId"],
        concurrently: true,
        name: "agent_sc_te_workspace_action",
      },
      {
        unique: true,
        fields: ["agentMCPActionId"],
        concurrently: true,
        name: "agent_step_content_tool_executions_agent_mcp_action_id",
      },
      {
        fields: ["workspaceId", "stepContentId"],
        concurrently: true,
        name: "agent_sc_te_workspace_step_content",
      },
      {
        fields: ["stepContentId"],
        concurrently: true,
        name: "agent_step_content_tool_executions_step_content_id",
      },
      {
        fields: ["workspaceId", "conversationId", "agentMessageId"],
        concurrently: true,
        name: "agent_sc_te_workspace_conversation_message",
      },
      {
        fields: ["conversationId"],
        concurrently: true,
        name: "agent_step_content_tool_executions_conversation_id",
      },
    ],
  }
);

AgentStepContentToolExecutionModel.belongsTo(AgentMCPActionModel, {
  foreignKey: { name: "agentMCPActionId", allowNull: false },
  onDelete: "RESTRICT",
  as: "agentMCPAction",
});
AgentMCPActionModel.hasOne(AgentStepContentToolExecutionModel, {
  foreignKey: { name: "agentMCPActionId", allowNull: false },
  as: "toolExecution",
});

AgentStepContentToolExecutionModel.belongsTo(AgentStepContentModel, {
  foreignKey: { name: "stepContentId", allowNull: false },
  onDelete: "RESTRICT",
  as: "stepContent",
});
AgentStepContentModel.hasMany(AgentStepContentToolExecutionModel, {
  foreignKey: { name: "stepContentId", allowNull: false },
  as: "toolExecutions",
});

AgentStepContentToolExecutionModel.belongsTo(AgentMessageModel, {
  foreignKey: { name: "agentMessageId", allowNull: false },
  onDelete: "RESTRICT",
  as: "agentMessage",
});
AgentMessageModel.hasMany(AgentStepContentToolExecutionModel, {
  foreignKey: { name: "agentMessageId", allowNull: false },
  as: "toolExecutions",
});
AgentStepContentToolExecutionModel.belongsTo(ConversationModel, {
  foreignKey: { name: "conversationId", allowNull: false },
  onDelete: "RESTRICT",
  as: "conversation",
});
ConversationModel.hasMany(AgentStepContentToolExecutionModel, {
  foreignKey: { name: "conversationId", allowNull: false },
  as: "toolExecutions",
});
