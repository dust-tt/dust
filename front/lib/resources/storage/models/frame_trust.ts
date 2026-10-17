import { frontSequelize } from "@app/lib/resources/storage";
import type {
  CreationOptional,
  ForeignKey,
} from "@app/lib/resources/storage/data_types";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

/**
 * One row per (viewer, Frame, publisher) trust decision: `userId` trusts code published by
 * `publisherUserId` in Frame `fileId` to make tool calls on their behalf.
 */
export class FrameTrustModel extends WorkspaceAwareModel<FrameTrustModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare userId: ForeignKey<UserModel["id"]>;
  declare fileId: ForeignKey<FileModel["id"]>;
  declare publisherUserId: ForeignKey<UserModel["id"]>;
}

FrameTrustModel.init(
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
  },
  {
    modelName: "frame_trust",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "userId", "fileId", "publisherUserId"],
        unique: true,
        concurrently: true,
      },
      {
        fields: ["fileId"],
        concurrently: true,
      },
      {
        fields: ["publisherUserId"],
        concurrently: true,
      },
    ],
  }
);

FrameTrustModel.belongsTo(UserModel, {
  as: "user",
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
});
FrameTrustModel.belongsTo(UserModel, {
  as: "publisher",
  foreignKey: { name: "publisherUserId", allowNull: false },
  onDelete: "RESTRICT",
});
FrameTrustModel.belongsTo(FileModel, {
  foreignKey: { name: "fileId", allowNull: false },
  onDelete: "RESTRICT",
});
FileModel.hasMany(FrameTrustModel, {
  foreignKey: { name: "fileId", allowNull: false },
  onDelete: "RESTRICT",
});
