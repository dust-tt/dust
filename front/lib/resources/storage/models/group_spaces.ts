import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { GroupKind } from "@app/types/groups";
import type { GroupSpaceKind } from "@app/types/space";
import type { CreationOptional, ForeignKey } from "sequelize";

export class GroupSpaceModel extends WorkspaceAwareModel<GroupSpaceModel> {
  declare createdAt: CreationOptional<Date>;
  declare groupId: ForeignKey<GroupModel["id"]>;
  // Denormalized from groups.kind. Keep in sync if group kinds ever become mutable.
  declare groupKind: GroupKind;
  declare vaultId: ForeignKey<SpaceModel["id"]>;
  declare kind: GroupSpaceKind;
}
GroupSpaceModel.init(
  {
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    kind: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "member",
      validate: {
        isIn: [["member", "project_editor", "project_viewer"]],
      },
    },
    groupKind: {
      type: DataTypes.STRING,
      allowNull: false,
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

GroupSpaceModel.belongsTo(SpaceModel, {
  as: "space",
  foreignKey: "vaultId",
});
