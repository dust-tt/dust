import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional } from "sequelize";

/** A blob that can be deleted after every signed read URL has expired. */
export class FileSystemBlobCleanupModel extends WorkspaceAwareModel<FileSystemBlobCleanupModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare nodeId: number;
  declare blobId: string;
  declare notBefore: Date;
  declare attempts: number;
  declare lastError: string | null;
}

FileSystemBlobCleanupModel.init(
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
    nodeId: { type: DataTypes.INTEGER, allowNull: false },
    blobId: { type: DataTypes.STRING, allowNull: false },
    notBefore: { type: DataTypes.DATE, allowNull: false },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lastError: { type: DataTypes.STRING, allowNull: true },
  },
  {
    modelName: "file_system_blob_cleanup",
    sequelize: frontSequelize,
    indexes: [
      { unique: true, fields: ["workspaceId", "nodeId", "blobId"] },
      { fields: ["notBefore", "id"] },
      { fields: ["workspaceId", "notBefore", "id"] },
    ],
  }
);
