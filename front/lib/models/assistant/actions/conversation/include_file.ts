import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";

/**
 * ConversationIncludeFile Action
 */
export class AgentConversationIncludeFileAction extends Model<
  InferAttributes<AgentConversationIncludeFileAction>,
  InferCreationAttributes<AgentConversationIncludeFileAction>
> {
  declare id: CreationOptional<number>;
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
    id: {
      type: DataTypes.INTEGER,
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
      {
        fields: ["agentMessageId"],
        concurrently: true,
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
