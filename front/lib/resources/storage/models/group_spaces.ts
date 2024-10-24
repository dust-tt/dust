import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";

export class GroupSpaceModel extends Model<
  InferAttributes<GroupSpaceModel>,
  InferCreationAttributes<GroupSpaceModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare groupId: ForeignKey<GroupModel["id"]>;
  declare vaultId: ForeignKey<SpaceModel["id"]>;
}
GroupSpaceModel.init(
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
  },
  {
    modelName: "group_vaults",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["vaultId", "groupId"], unique: true },
      { fields: ["groupId"] },
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
