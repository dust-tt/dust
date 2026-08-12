import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
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

  declare requestId: string;
  declare kind: FileSystemMutationKind;
  declare state: FileSystemMutationState;
  declare nodeId: number;
  declare sourceRootKind: FileSystemRootKind;
  declare sourceRootId: string;
  declare sourceParentId: number;
  declare sourceName: string;
  declare destinationRootKind: FileSystemRootKind | null;
  declare destinationRootId: string | null;
  declare destinationParentId: number | null;
  declare destinationName: string | null;
  declare replacedNodeId: number | null;
  declare sourceBlobId: string | null;
  declare replacedBlobId: string | null;
  declare removedFileResourceId: string | null;
  declare result: Record<string, unknown> | null;
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
    requestId: { type: DataTypes.STRING, allowNull: false },
    kind: { type: DataTypes.STRING, allowNull: false },
    state: { type: DataTypes.STRING, allowNull: false },
    nodeId: { type: DataTypes.INTEGER, allowNull: false },
    sourceRootKind: { type: DataTypes.STRING, allowNull: false },
    sourceRootId: { type: DataTypes.STRING, allowNull: false },
    sourceParentId: { type: DataTypes.INTEGER, allowNull: false },
    sourceName: { type: DataTypes.STRING, allowNull: false },
    destinationRootKind: { type: DataTypes.STRING, allowNull: true },
    destinationRootId: { type: DataTypes.STRING, allowNull: true },
    destinationParentId: { type: DataTypes.INTEGER, allowNull: true },
    destinationName: { type: DataTypes.STRING, allowNull: true },
    replacedNodeId: { type: DataTypes.INTEGER, allowNull: true },
    sourceBlobId: { type: DataTypes.STRING, allowNull: true },
    replacedBlobId: { type: DataTypes.STRING, allowNull: true },
    removedFileResourceId: { type: DataTypes.STRING, allowNull: true },
    result: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    modelName: "file_system_mutation",
    sequelize: frontSequelize,
    indexes: [
      { unique: true, fields: ["workspaceId", "requestId"] },
      { fields: ["workspaceId", "state", "updatedAt"] },
    ],
  }
);
