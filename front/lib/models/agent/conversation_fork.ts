import {
  ConversationModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

export class ConversationForkModel extends WorkspaceAwareModel<ConversationForkModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare parentConversationId: ForeignKey<ConversationModel["id"]>;
  declare childConversationId: ForeignKey<ConversationModel["id"]>;
  declare createdByUserId: ForeignKey<UserModel["id"]>;
  declare sourceMessageId: ForeignKey<MessageModel["id"]>;
  declare branchedAt: Date;

  declare parentConversation?: NonAttribute<ConversationModel>;
  declare childConversation?: NonAttribute<ConversationModel>;
  declare createdByUser?: NonAttribute<UserModel>;
  declare sourceMessage?: NonAttribute<MessageModel>;
}

ConversationForkModel.init(
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
    branchedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    modelName: "conversation_fork",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["childConversationId"],
        unique: true,
      },
      {
        fields: ["workspaceId", "parentConversationId"],
      },
      {
        fields: ["workspaceId", "sourceMessageId"],
      },
      {
        fields: ["parentConversationId"],
        concurrently: true,
      },
      {
        fields: ["createdByUserId"],
        concurrently: true,
      },
      {
        fields: ["sourceMessageId"],
        concurrently: true,
      },
    ],
  }
);

ConversationModel.hasMany(ConversationForkModel, {
  as: "forkedChildren",
  foreignKey: { name: "parentConversationId", allowNull: false },
  onDelete: "RESTRICT",
});
ConversationForkModel.belongsTo(ConversationModel, {
  as: "parentConversation",
  foreignKey: { name: "parentConversationId", allowNull: false },
});
ConversationModel.hasOne(ConversationForkModel, {
  as: "forkedFrom",
  foreignKey: { name: "childConversationId", allowNull: false },
  onDelete: "RESTRICT",
});
ConversationForkModel.belongsTo(ConversationModel, {
  as: "childConversation",
  foreignKey: { name: "childConversationId", allowNull: false },
});
UserModel.hasMany(ConversationForkModel, {
  as: "createdConversationForks",
  foreignKey: { name: "createdByUserId", allowNull: false },
  onDelete: "RESTRICT",
});
ConversationForkModel.belongsTo(UserModel, {
  as: "createdByUser",
  foreignKey: { name: "createdByUserId", allowNull: false },
});
MessageModel.hasMany(ConversationForkModel, {
  as: "conversationForks",
  foreignKey: { name: "sourceMessageId", allowNull: false },
  onDelete: "RESTRICT",
});
ConversationForkModel.belongsTo(MessageModel, {
  as: "sourceMessage",
  foreignKey: { name: "sourceMessageId", allowNull: false },
});
