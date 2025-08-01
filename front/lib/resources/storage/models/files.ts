import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type {
  AllSupportedFileContentType,
  FileStatus,
  FileUseCase,
  FileUseCaseMetadata,
} from "@app/types";

export class FileModel extends WorkspaceAwareModel<FileModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare contentType: AllSupportedFileContentType;
  declare fileName: string;
  declare fileSize: number;
  declare sharedAt: Date | null;
  declare snippet: string | null;
  declare status: FileStatus;
  declare useCase: FileUseCase;
  declare useCaseMetadata: FileUseCaseMetadata | null;

  declare userId: ForeignKey<UserModel["id"]> | null;

  declare user: NonAttribute<UserModel>;
}
FileModel.init(
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
    contentType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    fileName: {
      type: DataTypes.STRING(4096),
      allowNull: false,
    },
    fileSize: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    useCase: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    useCaseMetadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    },
    snippet: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    sharedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    modelName: "files",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["workspaceId", "id"] },
      { fields: ["workspaceId", "userId"] },
    ],
  }
);
UserModel.hasMany(FileModel, {
  foreignKey: { allowNull: true },
  onDelete: "RESTRICT",
});
FileModel.belongsTo(UserModel);
