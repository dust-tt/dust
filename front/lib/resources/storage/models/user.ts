import type { UserProviderType } from "@dust-tt/types";
import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { BaseModel } from "@app/lib/resources/storage/wrappers";

export class UserModel extends BaseModel<UserModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;
  declare auth0Sub: string | null;
  declare provider: UserProviderType;
  declare providerId: string | null;

  declare username: string;
  declare email: string;
  declare name: string;
  declare firstName: string;
  declare lastName: string | null;
  declare imageUrl: string | null;

  declare isDustSuperUser: CreationOptional<boolean>;
}
UserModel.init(
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
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    provider: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    providerId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    auth0Sub: {
      type: DataTypes.STRING,
      // TODO(2024-03-01 flav) Set to false once new login flow is released.
      allowNull: true,
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    imageUrl: {
      type: DataTypes.STRING(2048),
      allowNull: true,
    },
    isDustSuperUser: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
  },
  {
    modelName: "user",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["username"] },
      { fields: ["provider", "providerId"] },
      { fields: ["auth0Sub"], unique: true, concurrently: true },
      { unique: true, fields: ["sId"] },
      { fields: ["email"] },
    ],
  }
);

export class UserMetadataModel extends BaseModel<UserMetadataModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare key: string;
  declare value: string;
  declare userId: ForeignKey<UserModel["id"]>;
}
UserMetadataModel.init(
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
    key: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    modelName: "user_metadata",
    sequelize: frontSequelize,
    indexes: [{ fields: ["userId", "key"], unique: true }],
  }
);
UserModel.hasMany(UserMetadataModel, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
