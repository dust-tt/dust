import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
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
  declare isWorkspace: boolean;

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
    isWorkspace: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    modelName: "groups",
    sequelize: frontSequelize,
    indexes: [{ unique: true, fields: ["name"] }],
  }
);
Workspace.hasMany(GroupModel, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
GroupModel.belongsTo(Workspace);
