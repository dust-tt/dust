import { ConversationModel } from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes, Op } from "@app/lib/resources/storage/data_types";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { BatchSuggestionState } from "@app/types/suggestions/batch_suggestion";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";

// Groups agent and skill suggestions that are reviewed, and accepted or rejected, together. The
// members point at their batch through their own `batchId` column.
export class BatchSuggestionModel extends WorkspaceAwareModel<BatchSuggestionModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare title: string | null;
  declare analysis: string | null;
  declare state: CreationOptional<BatchSuggestionState>;
  declare sourceConversationModelId: ForeignKey<ConversationModel["id"]> | null;
  declare updatedByUserId: ForeignKey<UserModel["id"]> | null;

  declare sourceConversation: NonAttribute<ConversationModel | null>;
}

BatchSuggestionModel.init(
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
    title: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    analysis: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    state: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "pending",
      comment:
        "Review state of the batch, propagated to every member suggestion (pending, approved...).",
    },
    sourceConversationModelId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      comment: "Conversation in which the batch was suggested.",
    },
    updatedByUserId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: {
        model: UserModel,
        key: "id",
      },
      comment: "User who approved or rejected the batch.",
    },
  },
  {
    modelName: "batch_suggestion",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["workspaceId"], concurrently: true },
      {
        name: "batch_suggestions_source_conversation_model_id",
        fields: ["sourceConversationModelId"],
        concurrently: true,
        where: { sourceConversationModelId: { [Op.ne]: null } },
      },
      {
        name: "batch_suggestions_updated_by_user_id",
        fields: ["updatedByUserId"],
        concurrently: true,
        where: { updatedByUserId: { [Op.ne]: null } },
      },
    ],
  }
);

BatchSuggestionModel.belongsTo(ConversationModel, {
  foreignKey: { name: "sourceConversationModelId", allowNull: true },
  onDelete: "SET NULL",
  as: "sourceConversation",
});
ConversationModel.hasMany(BatchSuggestionModel, {
  foreignKey: { name: "sourceConversationModelId", allowNull: true },
  onDelete: "SET NULL",
});

UserModel.hasMany(BatchSuggestionModel, {
  foreignKey: { name: "updatedByUserId", allowNull: true },
  onDelete: "SET NULL",
});
BatchSuggestionModel.belongsTo(UserModel, {
  foreignKey: { name: "updatedByUserId", allowNull: true },
  as: "updatedByUser",
});
