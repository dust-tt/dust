import type {
  FileStatus,
  FileUseCase,
  FileUseCaseMetadata,
  SupportedFileContentType,
} from "@dust-tt/types";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { BaseModel } from "@app/lib/resources/storage/wrappers";

export class FileModel extends BaseModel<FileModel> {
  declare createdAt: CreationOptional<Date>;

  declare contentType: SupportedFileContentType;
  declare fileName: string;
  declare fileSize: number;
  declare status: FileStatus;
  declare useCase: FileUseCase;
  declare useCaseMetadata: FileUseCaseMetadata | null;
  declare snippet: string | null;

  declare userId: ForeignKey<UserModel["id"]> | null;
  declare workspaceId: ForeignKey<Workspace["id"]>;

  declare user: NonAttribute<UserModel>;
}
FileModel.init(
  {
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    contentType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    fileName: {
      type: DataTypes.STRING,
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
  },
  {
    modelName: "files",
    sequelize: frontSequelize,
    indexes: [{ fields: ["workspaceId", "id"] }],
  }
);
Workspace.hasMany(FileModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
UserModel.hasMany(FileModel, {
  foreignKey: { allowNull: true },
  onDelete: "RESTRICT",
});
FileModel.belongsTo(UserModel);
