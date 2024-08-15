import type { VaultKind } from "@dust-tt/types";
import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";
import { GroupModel } from "@app/lib/resources/storage/models/groups";

export class VaultModel extends Model<
  InferAttributes<VaultModel>,
  InferCreationAttributes<VaultModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: string;
  declare kind: VaultKind;

  declare groupId: ForeignKey<GroupModel["id"]>;
  declare workspaceId: ForeignKey<Workspace["id"]>;
}
VaultModel.init(
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
    kind: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "vaults",
    sequelize: frontSequelize,
    indexes: [
      { unique: true, fields: ["workspaceId", "name"] },
      { unique: false, fields: ["workspaceId", "kind"] },
    ],
  }
);

Workspace.hasMany(VaultModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
VaultModel.belongsTo(Workspace, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
VaultModel.belongsTo(GroupModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
