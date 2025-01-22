import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { ModelWithWorkspace } from "@app/lib/resources/storage/wrappers/model_with_workspace";

export class KeyModel extends ModelWithWorkspace<KeyModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare lastUsedAt: CreationOptional<Date>;

  declare secret: string;
  declare status: "active" | "disabled";
  declare isSystem: boolean;

  declare userId: ForeignKey<UserModel["id"]>;
  declare groupId: ForeignKey<GroupModel["id"]>;

  declare name: string | null;
  declare user: NonAttribute<UserModel>;
}
KeyModel.init(
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
// We don't want to delete keys when a user gets deleted.
UserModel.hasMany(KeyModel, {
  foreignKey: { allowNull: true },
  onDelete: "SET NULL",
});
GroupModel.hasMany(KeyModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});

KeyModel.belongsTo(UserModel);
