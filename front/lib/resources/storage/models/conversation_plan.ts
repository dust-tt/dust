import { ConversationModel } from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey } from "sequelize";

// State for the agent-maintained plan. The markdown content lives in the conversation's
// DustFileSystem (its path is derived from the conversation and the plan sId); this model holds
// only the state that has no home on the file system. Approval is optional and captured against
// `approvedVersion`, so an edit past that version makes the approval stale.
export class ConversationPlanModel extends WorkspaceAwareModel<ConversationPlanModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare conversationId: ForeignKey<ConversationModel["id"]>;
  declare version: CreationOptional<number>;
  declare isClosed: CreationOptional<boolean>;
  declare approvedAt: CreationOptional<Date | null>;
  declare approvedByUserId: CreationOptional<string | null>;
  declare approvedVersion: CreationOptional<number | null>;
}

ConversationPlanModel.init(
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
      references: {
        model: ConversationModel,
        key: "id",
      },
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    isClosed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    approvedByUserId: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    approvedVersion: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    modelName: "conversation_plan",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["conversationId"],
        name: "conversation_plans_conversation_id",
        concurrently: true,
      },
      // Enforce at most one active (non-closed) plan per conversation.
      {
        fields: ["workspaceId", "conversationId"],
        unique: true,
        where: { isClosed: false },
        name: "conversation_plans_active_unique",
        concurrently: true,
      },
    ],
  }
);

ConversationModel.hasMany(ConversationPlanModel, {
  foreignKey: { name: "conversationId", allowNull: false },
  onDelete: "RESTRICT",
});

ConversationPlanModel.belongsTo(ConversationModel, {
  foreignKey: { name: "conversationId", allowNull: false },
});
