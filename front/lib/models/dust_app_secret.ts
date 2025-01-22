import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { ModelWithWorkspace } from "@app/lib/resources/storage/wrappers/model_with_workspace";

export class DustAppSecret extends ModelWithWorkspace<DustAppSecret> {
  declare createdAt: CreationOptional<Date>;

  declare name: string;
  declare hash: string;

  declare userId: ForeignKey<UserModel["id"]>;

  declare user: NonAttribute<UserModel>;
}
DustAppSecret.init(
  {
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    hash: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    modelName: "dust_app_secrets",
    sequelize: frontSequelize,
    indexes: [{ fields: ["workspaceId"] }],
  }
);
// We don't want to delete keys when a user gets deleted.
UserModel.hasMany(DustAppSecret, {
  foreignKey: { allowNull: true },
  onDelete: "SET NULL",
});
DustAppSecret.belongsTo(UserModel);
