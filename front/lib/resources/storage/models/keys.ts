import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { User } from "@app/lib/models/user";
import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";
import { GroupModel } from "@app/lib/resources/storage/models/groups";

export class KeyModel extends Model<
  InferAttributes<KeyModel>,
  InferCreationAttributes<KeyModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare lastUsedAt: CreationOptional<Date>;

  declare secret: string;
  declare status: "active" | "disabled";
  declare isSystem: boolean;

  declare userId: ForeignKey<User["id"]>;
  declare groupId: ForeignKey<GroupModel["id"]>;
  declare workspaceId: ForeignKey<Workspace["id"]>;

  declare name: string | null;
  declare user: NonAttribute<User>;
}
KeyModel.init(
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
    lastUsedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    secret: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    isSystem: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
  },
  {
    modelName: "keys",
    sequelize: frontSequelize,
    indexes: [
      { unique: true, fields: ["secret"] },
      { fields: ["userId"] },
      { fields: ["workspaceId"] },
    ],
  }
);
Workspace.hasMany(KeyModel, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
// We don't want to delete keys when a user gets deleted.
User.hasMany(KeyModel, {
  foreignKey: { allowNull: true },
  onDelete: "SET NULL",
});
GroupModel.hasMany(KeyModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});

KeyModel.belongsTo(User);
