import type { GroupType } from "@dust-tt/types";
import { isSystemGroupType } from "@dust-tt/types";
import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  Transaction,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";

export class GroupModel extends Model<
  InferAttributes<GroupModel>,
  InferCreationAttributes<GroupModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: string;
  declare type: GroupType;

  declare workspaceId: ForeignKey<Workspace["id"]>;
}
GroupModel.init(
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
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "groups",
    sequelize: frontSequelize,
    indexes: [{ unique: true, fields: ["workspaceId", "name"] }],
  }
);

GroupModel.addHook(
  "beforeSave",
  "enforce_one_system_group_per_workspace",
  async (group: GroupModel, options: { transaction: Transaction }) => {
    if (isSystemGroupType(group.type)) {
      const existingSystemGroupType = await GroupModel.findOne({
        where: {
          workspaceId: group.workspaceId,
          type: group.type,
        },
        transaction: options.transaction,
      });

      if (existingSystemGroupType) {
        throw new Error("A system group exists for this workspace.");
      }
    }
  }
);

Workspace.hasMany(GroupModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
GroupModel.belongsTo(Workspace);
