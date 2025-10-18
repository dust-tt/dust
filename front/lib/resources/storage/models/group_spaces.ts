import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class GroupSpaceModel extends WorkspaceAwareModel<GroupSpaceModel> {
  declare createdAt: CreationOptional<Date>;
  declare groupId: ForeignKey<GroupModel["id"]>;
  declare vaultId: ForeignKey<SpaceModel["id"]>;
}
GroupSpaceModel.init(
  {
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    modelName: "group_vaults",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["vaultId", "groupId"], unique: true },
      // TODO(WORKSPACE_ID_ISOLATION 2025-05-13): Remove index
      { fields: ["groupId"] },
      {
        fields: ["workspaceId", "groupId"],
        concurrently: true,
      },
    ],
  }
);

SpaceModel.belongsToMany(GroupModel, {
  through: GroupSpaceModel,
  foreignKey: "vaultId",
});
GroupModel.belongsToMany(SpaceModel, {
  through: GroupSpaceModel,
  foreignKey: "groupId",
});

GroupModel.hasMany(GroupSpaceModel, {
  foreignKey: "groupId",
  as: "groupSpaces",
});
