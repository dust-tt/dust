import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";

// Captures content that is emitted by an assistant before using a tool.
// This content is not part of the final message sent to the user and is not
// stored in the AgentMessage table.
// TODO(fontanierh): Also store the final generation in this table.
// Ultimately, this table should model the `content` field of the model provider messages.
export class AgentMessageContent extends Model<
  InferAttributes<AgentMessageContent>,
  InferCreationAttributes<AgentMessageContent>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentMessageId: ForeignKey<AgentMessage["id"]>;
  declare step: number;

  declare content: string;
}

AgentMessageContent.init(
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
    agentMessageId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    step: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    sequelize: frontSequelize,
    modelName: "agent_message_content",
    indexes: [
      {
        fields: ["agentMessageId", "step"],
        unique: true,
      },
    ],
  }
);

AgentMessageContent.belongsTo(AgentMessage, {
  as: "agentMessage",
  foreignKey: {
    name: "agentMessageId",
    allowNull: false,
  },
  onDelete: "CASCADE",
});

AgentMessage.hasMany(AgentMessageContent, {
  as: "agentMessageContents",
  foreignKey: {
    name: "agentMessageId",
    allowNull: false,
  },
  onDelete: "CASCADE",
});
