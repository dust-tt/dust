import { frontSequelize } from "@app/lib/resources/storage";
import {
  DANGEROUSLY_UNBOUNDED_TEXT,
  DataTypes,
} from "@app/lib/resources/storage/data_types";
import type { FileSystemRootKind } from "@app/lib/resources/storage/models/file_system_node";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional } from "sequelize";

export type FileSystemMutationKind = "remove" | "rename";
export type FileSystemMutationState = "prepared" | "completed";

/** Durable intent for a rename/delete that also updates a FileResource. */
export class FileSystemMutationModel extends WorkspaceAwareModel<FileSystemMutationModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare completedAt: CreationOptional<Date | null>;

  declare requestId: string;
  declare kind: FileSystemMutationKind;
  declare state: FileSystemMutationState;
  declare nodeId: number;
  declare nodeKind: "directory" | "file";
  declare sourceRootKind: FileSystemRootKind;
  declare sourceRootId: string;
  declare sourceParentId: number;
  declare sourceName: string;
  declare sourceRelativePath: string;
  declare destinationRootKind: FileSystemRootKind | null;
  declare destinationRootId: string | null;
  declare destinationParentId: number | null;
  declare destinationName: string | null;
  declare destinationRelativePath: string | null;
  declare replacedNodeId: number | null;
  declare sourceBlobId: string | null;
  declare replacedBlobId: string | null;
  declare removedFileResourceId: string | null;
  declare lastError: string | null;
  declare attempts: number;
}

FileSystemMutationModel.init(
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
    completedAt: { type: DataTypes.DATE, allowNull: true },
    requestId: { type: DataTypes.STRING, allowNull: false },
    kind: { type: DataTypes.STRING, allowNull: false },
    state: { type: DataTypes.STRING, allowNull: false },
    nodeId: { type: DataTypes.BIGINT, allowNull: false },
    nodeKind: { type: DataTypes.STRING, allowNull: false },
    sourceRootKind: { type: DataTypes.STRING, allowNull: false },
    sourceRootId: { type: DataTypes.STRING, allowNull: false },
    sourceParentId: { type: DataTypes.BIGINT, allowNull: false },
    sourceName: { type: DataTypes.STRING, allowNull: false },
    sourceRelativePath: { type: DataTypes.STRING, allowNull: false },
    destinationRootKind: { type: DataTypes.STRING, allowNull: true },
    destinationRootId: { type: DataTypes.STRING, allowNull: true },
    destinationParentId: { type: DataTypes.BIGINT, allowNull: true },
    destinationName: { type: DataTypes.STRING, allowNull: true },
    destinationRelativePath: { type: DataTypes.STRING, allowNull: true },
    replacedNodeId: { type: DataTypes.BIGINT, allowNull: true },
    sourceBlobId: { type: DataTypes.STRING, allowNull: true },
    replacedBlobId: { type: DataTypes.STRING, allowNull: true },
    removedFileResourceId: { type: DataTypes.STRING, allowNull: true },
    lastError: { type: DANGEROUSLY_UNBOUNDED_TEXT, allowNull: true },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    modelName: "file_system_mutation",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "file_system_mutations_request_idx",
        unique: true,
        fields: ["workspaceId", "requestId"],
      },
      {
        name: "file_system_mutations_state_idx",
        fields: ["state", "updatedAt"],
      },
      {
        name: "file_system_mutations_node_idx",
        fields: ["workspaceId", "nodeId"],
      },
      {
        name: "file_system_mutations_completed_idx",
        fields: ["workspaceId", "state", "completedAt"],
      },
    ],
  }
);
