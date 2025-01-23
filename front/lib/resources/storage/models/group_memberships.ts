import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class GroupMembershipModel extends WorkspaceAwareModel<GroupMembershipModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare startAt: Date;
  declare endAt: Date | null;

  declare groupId: ForeignKey<GroupModel["id"]>;
  declare userId: ForeignKey<UserModel["id"]>;
}
GroupMembershipModel.init(
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
    startAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    endAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    modelName: "group_memberships",
    sequelize: frontSequelize,
    indexes: [{ fields: ["userId", "groupId"] }],
  }
);
UserModel.hasMany(GroupMembershipModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
GroupModel.hasMany(GroupMembershipModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
GroupMembershipModel.belongsTo(UserModel);
GroupMembershipModel.belongsTo(GroupModel);
