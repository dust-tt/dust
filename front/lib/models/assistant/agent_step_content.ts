import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { AssistantContentItemType } from "@app/types/assistant/agent_message_content";

export class AgentStepContentModel extends WorkspaceAwareModel<AgentStepContentModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentMessageId: ForeignKey<AgentMessage["id"]>;
  declare step: number;
  declare index: number;
  declare type: AssistantContentItemType["type"];
  declare value: AssistantContentItemType;

  declare agentMessage?: NonAttribute<AgentMessage>;
}

AgentStepContentModel.init(
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
    agentMessageId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: "agent_messages",
        key: "id",
      },
    },
    step: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    index: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [["text_content", "reasoning", "function_call"]],
      },
    },
    value: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
  },
  {
    sequelize: frontSequelize,
    modelName: "agent_step_content",
    tableName: "agent_step_contents",
    indexes: [
      {
        unique: true,
        fields: ["agentMessageId", "step", "index"],
        name: "agent_step_contents_agent_message_id_step_index_in_step",
      },
      {
        fields: ["agentMessageId"],
        name: "agent_step_contents_agent_message_id_idx",
      },
      {
        fields: ["workspaceId"],
        name: "agent_step_contents_workspace_id_idx",
      },
      {
        fields: ["type"],
        name: "agent_step_contents_type_idx",
      },
    ],
  }
);

AgentStepContentModel.belongsTo(AgentMessage, {
  as: "agentMessage",
  foreignKey: {
    name: "agentMessageId",
    allowNull: false,
  },
  onDelete: "RESTRICT",
});

AgentMessage.hasMany(AgentStepContentModel, {
  as: "agentStepContents",
  foreignKey: {
    name: "agentMessageId",
    allowNull: false,
  },
  onDelete: "RESTRICT",
});
