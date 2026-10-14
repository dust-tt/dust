import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey } from "sequelize";

// The dfs folder of a user in a workspace's tenant (`users/<userSId>` under the tenant root). Users
// span workspaces and each workspace has its own tenant, so the folder is per workspace and user.
export class DfsUserFolderModel extends WorkspaceAwareModel<DfsUserFolderModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare userId: ForeignKey<UserModel["id"]>;
  declare dfsObjectId: string;
}

DfsUserFolderModel.init(
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
    dfsObjectId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: frontSequelize,
    modelName: "dfs_user_folders",
    indexes: [
      {
        fields: ["workspaceId", "userId"],
        name: "dfs_user_folders_workspace_id_user_id_idx",
        unique: true,
        concurrently: true,
      },
      {
        fields: ["userId"],
        name: "dfs_user_folders_user_id_idx",
        concurrently: true,
      },
    ],
  }
);

UserModel.hasMany(DfsUserFolderModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
});
DfsUserFolderModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: false },
});
