import { ConversationModel } from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

export type SandboxStatus = "running" | "sleeping" | "deleted";

export class SandboxModel extends WorkspaceAwareModel<SandboxModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare conversationId: ForeignKey<ConversationModel["id"]>;
  declare providerId: string;
  declare status: SandboxStatus;
  declare lastActivityAt: Date;

  // Associations.
  declare conversation: NonAttribute<ConversationModel>;
}

SandboxModel.init(
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
    providerId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "running",
    },
    lastActivityAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    modelName: "sandbox",
    sequelize: frontSequelize,
    indexes: [
      {
        unique: true,
        fields: ["workspaceId", "conversationId"],
        name: "sandboxes_workspace_conversation_idx",
      },
      {
        fields: ["conversationId"],
        name: "sandboxes_conversation_id_idx",
        concurrently: true,
      },
      {
        fields: ["status", "lastActivityAt"],
        name: "sandboxes_status_last_activity_idx",
      },
    ],
  }
);

ConversationModel.hasMany(SandboxModel, {
  foreignKey: "conversationId",
  onDelete: "RESTRICT",
});

SandboxModel.belongsTo(ConversationModel, {
  foreignKey: "conversationId",
});
