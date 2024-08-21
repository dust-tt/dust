import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { VaultModel } from "@app/lib/resources/storage/models/vaults";

export class GroupVaultModel extends Model<
  InferAttributes<GroupVaultModel>,
  InferCreationAttributes<GroupVaultModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare groupId: ForeignKey<GroupModel["id"]>;
  declare vaultId: ForeignKey<VaultModel["id"]>;
}
GroupVaultModel.init(
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
    indexes: [{ fields: ["vaultId", "groupId"] }, { fields: ["groupId"] }],
  }
);

VaultModel.belongsToMany(GroupModel, {
  through: GroupVaultModel,
});
GroupModel.belongsToMany(VaultModel, {
  through: GroupVaultModel,
});
