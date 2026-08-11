import { frontSequelize } from "@app/lib/resources/storage";
import {
  DANGEROUSLY_UNBOUNDED_TEXT,
  DataTypes,
} from "@app/lib/resources/storage/data_types";
import { SandboxModel } from "@app/lib/resources/storage/models/sandbox";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ModelId } from "@app/types/shared/model_id";
import type { CreationOptional, ForeignKey } from "sequelize";

export type SandboxFileSystemMutationStatus =
  | "pending"
  | "completed"
  | "failed";

export class SandboxFileSystemMutationModel extends WorkspaceAwareModel<SandboxFileSystemMutationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sandboxId: ForeignKey<SandboxModel["id"]>;
  declare idempotencyKey: string;
  declare request: Record<string, unknown>;
  declare requestHash: string;
  declare status: SandboxFileSystemMutationStatus;
  declare error: string | null;
  declare completedAt: Date | null;
  declare claimedAt: Date;
  declare claimedBy: string;
  declare id: CreationOptional<ModelId>;
}

SandboxFileSystemMutationModel.init(
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
    sandboxId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    idempotencyKey: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    request: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    requestHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: "pending",
    },
    error: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: true,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    claimedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    claimedBy: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
  },
  {
    modelName: "sandbox_file_system_mutation",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "sandbox_fs_mutations_idempotency_idx",
        unique: true,
        fields: ["workspaceId", "sandboxId", "idempotencyKey"],
        concurrently: true,
      },
      {
        name: "sandbox_fs_mutations_sandbox_id_idx",
        fields: ["sandboxId"],
        concurrently: true,
      },
      {
        name: "sandbox_fs_mutations_workspace_id_idx",
        fields: ["workspaceId"],
        concurrently: true,
      },
    ],
  }
);

SandboxFileSystemMutationModel.belongsTo(SandboxModel, {
  foreignKey: { name: "sandboxId", allowNull: false },
  onDelete: "CASCADE",
});

SandboxModel.hasMany(SandboxFileSystemMutationModel, {
  foreignKey: { name: "sandboxId", allowNull: false },
});
