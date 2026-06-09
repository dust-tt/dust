import { ConversationModel } from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes, Op } from "@app/lib/resources/storage/data_types";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";

export type SandboxStatus =
  | "running"
  | "sleeping"
  | "deleted"
  | "pending_approval";

export class SandboxModel extends WorkspaceAwareModel<SandboxModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare conversationId: ForeignKey<ConversationModel["id"]>;
  declare providerId: string;
  declare status: SandboxStatus;
  declare statusChangedAt: CreationOptional<Date>;
  declare lastActivityAt: Date;
  declare baseImage: CreationOptional<string | null>;
  declare version: CreationOptional<string | null>;
  declare killRequestedAt: CreationOptional<Date | null>;

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
    statusChangedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastActivityAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    baseImage: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    version: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    killRequestedAt: {
      type: DataTypes.DATE,
      allowNull: true,
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
      {
        fields: ["killRequestedAt"],
        name: "sandboxes_kill_requested_at_idx",
        where: { killRequestedAt: { [Op.ne]: null } },
      },
      {
        fields: ["baseImage", "version"],
        name: "sandboxes_base_image_version_idx",
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
