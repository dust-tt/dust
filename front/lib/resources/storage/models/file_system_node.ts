import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes, Op } from "@app/lib/resources/storage/data_types";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey } from "sequelize";

export type FileSystemNodeKind = "directory" | "file";
export type FileSystemRootKind = "conversation" | "pod";

/** One stable inode in Dust's PostgreSQL-owned file tree. */
export class FileSystemNodeModel extends WorkspaceAwareModel<FileSystemNodeModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare parentId: ForeignKey<FileSystemNodeModel["id"]> | null;
  declare rootKind: FileSystemRootKind;
  declare rootId: string;
  declare name: string;
  declare kind: FileSystemNodeKind;
  declare mode: number;
  declare size: number;
  declare contentType: string | null;
  declare blobId: string | null;
  declare contentRevision: number;
  declare fileId: ForeignKey<FileModel["id"]> | null;
  declare pendingMutationId: number | null;
}

FileSystemNodeModel.init(
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
    parentId: { type: DataTypes.INTEGER, allowNull: true },
    rootKind: { type: DataTypes.STRING, allowNull: false },
    rootId: { type: DataTypes.STRING, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    kind: { type: DataTypes.STRING, allowNull: false },
    mode: { type: DataTypes.INTEGER, allowNull: false },
    size: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    contentType: { type: DataTypes.STRING, allowNull: true },
    blobId: { type: DataTypes.STRING, allowNull: true },
    contentRevision: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    fileId: { type: DataTypes.INTEGER, allowNull: true },
    pendingMutationId: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    modelName: "file_system_node",
    sequelize: frontSequelize,
    indexes: [
      {
        unique: true,
        fields: ["workspaceId", "parentId", "name"],
        where: { parentId: { [Op.ne]: null } },
      },
      {
        unique: true,
        fields: ["workspaceId", "rootKind", "rootId"],
        where: { parentId: { [Op.is]: null } },
      },
      {
        unique: true,
        fields: ["workspaceId", "fileId"],
        where: { fileId: { [Op.ne]: null } },
      },
      { fields: ["workspaceId", "rootKind", "rootId"] },
      { fields: ["workspaceId", "pendingMutationId"] },
    ],
  }
);

FileSystemNodeModel.belongsTo(FileSystemNodeModel, {
  as: "parent",
  foreignKey: { name: "parentId", allowNull: true },
  onDelete: "CASCADE",
});
FileSystemNodeModel.belongsTo(FileModel, {
  foreignKey: { name: "fileId", allowNull: true },
  onDelete: "SET NULL",
});
FileSystemNodeModel.belongsTo(WorkspaceModel, {
  foreignKey: { name: "workspaceId", allowNull: false },
  onDelete: "CASCADE",
});
