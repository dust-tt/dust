import { ConversationModel } from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes, Op } from "@app/lib/resources/storage/data_types";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
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

  declare providerId: string;
  declare status: SandboxStatus;
  declare statusChangedAt: CreationOptional<Date>;
  declare lastActivityAt: Date;
  declare lastRuntimeRefreshAt: CreationOptional<Date | null>;
  declare baseImage: CreationOptional<string | null>;
  declare version: CreationOptional<string | null>;
  declare killRequestedAt: CreationOptional<Date | null>;
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
    lastRuntimeRefreshAt: {
      type: DataTypes.DATE,
      allowNull: true,
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
        // Keep through the sandbox reaper rollback window: the pre-patch stale
        // query does not exclude kill-requested rows and cannot use the new
        // partial reaper index.
        fields: ["status", "lastActivityAt"],
        name: "sandboxes_status_last_activity_idx",
      },
      {
        fields: ["killRequestedAt", "id"],
        name: "sandboxes_reaper_kill_requested_idx",
        where: {
          killRequestedAt: { [Op.ne]: null },
          status: { [Op.ne]: "deleted" },
        },
      },
      {
        // Low-priority reaper sweep: kill-requested sleeping sandboxes are
        // destroyed most-recently-active first.
        fields: ["lastActivityAt", "id"],
        name: "sandboxes_reaper_kill_requested_sleeping_idx",
        where: {
          killRequestedAt: { [Op.ne]: null },
          status: "sleeping",
        },
      },
      {
        fields: ["status", "lastActivityAt", "id"],
        name: "sandboxes_reaper_stale_idx",
        where: { killRequestedAt: { [Op.is]: null } },
      },
      {
        fields: ["baseImage", "version"],
        name: "sandboxes_base_image_version_idx",
      },
    ],
  }
);

export class SandboxOwnerModel extends WorkspaceAwareModel<SandboxOwnerModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare conversationId: ForeignKey<ConversationModel["id"]> | null;
  declare spaceId: ForeignKey<SpaceModel["id"]> | null;
  declare frameFileModelId: ForeignKey<FileModel["id"]> | null;
  declare sandboxId: ForeignKey<SandboxModel["id"]>;

  declare conversation: NonAttribute<ConversationModel>;
  declare space: NonAttribute<SpaceModel>;
  declare frameFile: NonAttribute<FileModel | null>;
  declare sandbox: NonAttribute<SandboxModel>;
}

SandboxOwnerModel.init(
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
      allowNull: true,
    },
    spaceId: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    frameFileModelId: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    sandboxId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
  },
  {
    modelName: "sandbox_owner",
    sequelize: frontSequelize,
    indexes: [
      {
        unique: true,
        fields: ["workspaceId", "sandboxId"],
        name: "sandbox_owners_workspace_sandbox_idx",
        concurrently: true,
      },
      {
        unique: true,
        fields: ["workspaceId", "conversationId"],
        name: "sandbox_owners_workspace_conversation_idx",
        where: { conversationId: { [Op.ne]: null } },
        concurrently: true,
      },
      {
        unique: true,
        fields: ["workspaceId", "spaceId"],
        name: "sandbox_owners_workspace_space_idx",
        where: { spaceId: { [Op.ne]: null } },
        concurrently: true,
      },
      {
        unique: true,
        fields: ["workspaceId", "frameFileModelId"],
        name: "sandbox_owners_workspace_frame_file_model_idx",
        where: { frameFileModelId: { [Op.ne]: null } },
        concurrently: true,
      },
      {
        fields: ["conversationId"],
        name: "sandbox_owners_conversation_id_idx",
        concurrently: true,
      },
      {
        fields: ["spaceId"],
        name: "sandbox_owners_space_id_idx",
        concurrently: true,
      },
      {
        fields: ["frameFileModelId"],
        name: "sandbox_owners_frame_file_model_id_idx",
        concurrently: true,
      },
      {
        fields: ["sandboxId"],
        name: "sandbox_owners_sandbox_id_idx",
        concurrently: true,
      },
    ],
  }
);

SandboxOwnerModel.belongsTo(ConversationModel, {
  foreignKey: { name: "conversationId", allowNull: true },
  onDelete: "RESTRICT",
  as: "conversation",
});

ConversationModel.hasMany(SandboxOwnerModel, {
  foreignKey: { name: "conversationId", allowNull: true },
  as: "sandboxOwnerLinks",
});

SandboxOwnerModel.belongsTo(SpaceModel, {
  foreignKey: { name: "spaceId", allowNull: true },
  onDelete: "RESTRICT",
  as: "space",
});

SpaceModel.hasMany(SandboxOwnerModel, {
  foreignKey: { name: "spaceId", allowNull: true },
  as: "sandboxOwnerLinks",
});

SandboxOwnerModel.belongsTo(FileModel, {
  foreignKey: { name: "frameFileModelId", allowNull: true },
  onDelete: "RESTRICT",
  as: "frameFile",
});

FileModel.hasMany(SandboxOwnerModel, {
  foreignKey: { name: "frameFileModelId", allowNull: true },
  as: "sandboxOwnerLinks",
});

SandboxOwnerModel.belongsTo(SandboxModel, {
  foreignKey: { name: "sandboxId", allowNull: false },
  onDelete: "RESTRICT",
  as: "sandbox",
});

SandboxModel.hasOne(SandboxOwnerModel, {
  foreignKey: { name: "sandboxId", allowNull: false },
  as: "ownerLink",
});
