import {
  ConversationModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type {
  ButlerSuggestionMetadata,
  ButlerSuggestionStatus,
  ButlerSuggestionType,
} from "@app/types/conversation_butler_suggestion";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

export class ConversationButlerSuggestionModel extends WorkspaceAwareModel<ConversationButlerSuggestionModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare conversationId: ForeignKey<ConversationModel["id"]>;
  declare sourceMessageId: ForeignKey<MessageModel["id"]>;
  declare resultMessageId: ForeignKey<MessageModel["id"]> | null;
  declare userId: ForeignKey<UserModel["id"]> | null;

  declare suggestionType: ButlerSuggestionType;
  declare metadata: ButlerSuggestionMetadata;
  declare status: ButlerSuggestionStatus;

  declare conversation: NonAttribute<ConversationModel>;
  declare sourceMessage: NonAttribute<MessageModel>;
  declare resultMessage: NonAttribute<MessageModel | null>;
  declare user: NonAttribute<UserModel | null>;
}

ConversationButlerSuggestionModel.init(
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
    conversationId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    sourceMessageId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    resultMessageId: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    userId: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    suggestionType: {
      type: DataTypes.STRING,
      allowNull: false,
      comment:
        "Discriminator for the suggestion type (e.g., rename_title, call_agent).",
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment:
        "JSONB payload containing the suggestion details, structure depends on suggestionType.",
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "pending",
      comment:
        "Current status of the suggestion (pending, accepted, dismissed).",
    },
  },
  {
    modelName: "conversation_butler_suggestion",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "conversation_butler_suggestions_ws_conv_status_idx",
        fields: ["workspaceId", "conversationId", "status"],
        concurrently: true,
      },
      {
        name: "conversation_butler_suggestions_source_message_idx",
        fields: ["sourceMessageId"],
        concurrently: true,
      },
      {
        name: "conversation_butler_suggestions_result_message_idx",
        fields: ["resultMessageId"],
        concurrently: true,
      },
      {
        name: "conversation_butler_suggestions_user_idx",
        fields: ["userId"],
        concurrently: true,
      },
    ],
  }
);

ConversationButlerSuggestionModel.belongsTo(ConversationModel, {
  foreignKey: { name: "conversationId", allowNull: false },
  onDelete: "RESTRICT",
  as: "conversation",
});

ConversationButlerSuggestionModel.belongsTo(MessageModel, {
  foreignKey: { name: "sourceMessageId", allowNull: false },
  onDelete: "RESTRICT",
  as: "sourceMessage",
});

ConversationButlerSuggestionModel.belongsTo(MessageModel, {
  foreignKey: { name: "resultMessageId", allowNull: true },
  onDelete: "RESTRICT",
  as: "resultMessage",
});

ConversationButlerSuggestionModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: true },
  onDelete: "RESTRICT",
  as: "user",
});
