import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

/**
 * ConversationIncludeFile Action
 */
export class AgentConversationIncludeFileAction extends WorkspaceAwareModel<AgentConversationIncludeFileAction> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare fileId: string;
  declare fileTitle: string | null;
  declare tokensCount: number | null;
  declare functionCallId: string | null;
  declare functionCallName: string | null;

  declare step: number;
  declare agentMessageId: ForeignKey<AgentMessage["id"]>;
}
AgentConversationIncludeFileAction.init(
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
    fileTitle: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    tokensCount: {
      type: DataTypes.INTEGER,
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
    modelName: "agent_conversation_include_file_action",
    sequelize: frontSequelize,
    indexes: [
      // TODO(WORKSPACE_ID_ISOLATION 2025-05-13): Remove index
      {
        fields: ["agentMessageId"],
        concurrently: true,
      },
      {
        fields: ["workspaceId", "agentMessageId"],
        concurrently: true,
        name: "agent_conv_include_file_action_w_id_agent_message_id",
      },
    ],
  }
);

AgentConversationIncludeFileAction.belongsTo(AgentMessage, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});

AgentMessage.hasMany(AgentConversationIncludeFileAction, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});
