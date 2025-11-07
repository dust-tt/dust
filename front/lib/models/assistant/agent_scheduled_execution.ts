import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import {
  AgentMessage,
  ConversationModel,
  Message,
} from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export type AgentScheduledExecutionStatus =
  | "scheduled"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export class AgentScheduledExecutionModel extends WorkspaceAwareModel<AgentScheduledExecutionModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare conversationId: ForeignKey<ConversationModel["id"]>;
  declare agentMessageId: ForeignKey<AgentMessage["id"]>;
  declare userMessageId: ForeignKey<Message["id"]>;

  declare workflowId: string;
  declare delayMs: number;
  declare scheduledFor: Date;
  declare status: CreationOptional<AgentScheduledExecutionStatus>;
  declare error: string | null;
}

AgentScheduledExecutionModel.init(
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
    workflowId: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
    },
    delayMs: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    scheduledFor: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "scheduled",
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    modelName: "agent_scheduled_execution",
    indexes: [
      {
        fields: ["workspaceId"],
      },
      {
        unique: true,
        fields: ["workflowId"],
      },
    ],
    sequelize: frontSequelize,
  }
);

AgentScheduledExecutionModel.belongsTo(ConversationModel, {
  as: "conversation",
  foreignKey: {
    name: "conversationId",
    allowNull: false,
  },
  onDelete: "RESTRICT",
});

AgentScheduledExecutionModel.belongsTo(AgentMessage, {
  as: "agentMessage",
  foreignKey: {
    name: "agentMessageId",
    allowNull: false,
  },
  onDelete: "RESTRICT",
});

AgentScheduledExecutionModel.belongsTo(Message, {
  as: "userMessage",
  foreignKey: {
    name: "userMessageId",
    allowNull: false,
  },
  onDelete: "RESTRICT",
});
