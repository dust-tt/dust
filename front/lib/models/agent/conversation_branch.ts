import {
  ConversationModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

export type ConversationBranchState = "open" | "merged" | "closed";

export class ConversationBranchModel extends WorkspaceAwareModel<ConversationBranchModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare state: ConversationBranchState;

  // The message that this branch is branched from.
  declare previousMessageId: ForeignKey<MessageModel["id"]>;

  declare conversationId: ForeignKey<ConversationModel["id"]>;
  declare userId: ForeignKey<UserModel["id"]>;

  declare conversation?: NonAttribute<ConversationModel>;
  declare user?: NonAttribute<UserModel>;
  declare previousMessage?: NonAttribute<MessageModel>;
}

ConversationBranchModel.init(
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
    state: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "conversation_branch",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "conversationId", "userId"],
      },
      {
        fields: ["previousMessageId"],
      },
    ],
  }
);

ConversationModel.hasMany(ConversationBranchModel, {
  foreignKey: { name: "conversationId", allowNull: false },
  onDelete: "RESTRICT",
});
ConversationBranchModel.belongsTo(ConversationModel, {
  foreignKey: { name: "conversationId", allowNull: false },
});
UserModel.hasMany(ConversationBranchModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
});
ConversationBranchModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: false },
});
MessageModel.hasMany(ConversationBranchModel, {
  foreignKey: { name: "previousMessageId", allowNull: false },
  onDelete: "RESTRICT",
});
ConversationBranchModel.belongsTo(MessageModel, {
  as: "previousMessage",
  foreignKey: { name: "previousMessageId", allowNull: false },
});
