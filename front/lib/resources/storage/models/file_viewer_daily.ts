import { frontSequelize } from "@app/lib/resources/storage";
import type {
  CreationOptional,
  ForeignKey,
} from "@app/lib/resources/storage/data_types";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

/**
 * @cc [owner:flvndvd,label:backend;concurrency] file-owned-viewer-history
 * File and workspace foreign keys MUST restrict deletion while viewer rows remain.
 * Cleanup MUST explicitly remove viewer rows before deleting their file or workspace.
 */
export class FileViewerDailyModel extends WorkspaceAwareModel<FileViewerDailyModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare fileId: ForeignKey<FileModel["id"]>;
  declare email: string;
  declare viewedOn: string;
  declare firstViewedAt: Date;
  declare lastViewedAt: Date;
}

FileViewerDailyModel.init(
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
    email: { type: DataTypes.STRING(255), allowNull: false },
    viewedOn: { type: DataTypes.DATEONLY, allowNull: false },
    firstViewedAt: { type: DataTypes.DATE, allowNull: false },
    lastViewedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    modelName: "file_viewer_daily",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["workspaceId", "fileId", "email", "viewedOn"], unique: true },
      { fields: ["fileId"], concurrently: true },
    ],
  }
);

FileModel.hasMany(FileViewerDailyModel, {
  foreignKey: { name: "fileId", allowNull: false },
  onDelete: "RESTRICT",
});
FileViewerDailyModel.belongsTo(FileModel, {
  foreignKey: { name: "fileId", allowNull: false },
});
