import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { User } from "@app/lib/models/user";
import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";
import { GroupModel } from "@app/lib/resources/storage/models/groups";

export class GroupMembershipModel extends Model<
  InferAttributes<GroupMembershipModel>,
  InferCreationAttributes<GroupMembershipModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare startAt: Date;
  declare endAt: Date | null;

  declare groupId: ForeignKey<GroupModel["id"]>;
  declare userId: ForeignKey<User["id"]>;
  declare workspaceId: ForeignKey<Workspace["id"]>;
}
GroupMembershipModel.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
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
User.hasMany(GroupMembershipModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
GroupModel.hasMany(GroupMembershipModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
Workspace.hasMany(GroupMembershipModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
GroupMembershipModel.belongsTo(User);
GroupMembershipModel.belongsTo(GroupModel);
GroupMembershipModel.belongsTo(Workspace);
