import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model, Op } from "sequelize";

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

  static async checkOverlap(
    userId: number,
    groupId: number,
    startAt: Date,
    endAt: Date | null,
    excludeId?: number
  ) {
    const whereOptions: any = {
      userId,
      groupId,
      [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: startAt } }],
      startAt: { [Op.lt]: endAt || new Date(8640000000000000) }, // Max date if endAt is null
    };

    if (excludeId) {
      whereOptions.id = { [Op.ne]: excludeId };
    }

    const overlapping = await this.findOne({ where: whereOptions });
    return !!overlapping;
  }
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
    validate: {
      async noOverlap() {
        if (
          await GroupMembershipModel.checkOverlap(
            this.userId as number,
            this.groupId as number,
            this.startAt as Date,
            this.endAt as Date | null,
            this.id as number
          )
        ) {
          throw new Error("Overlapping group membership period");
        }
      },
    },
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
