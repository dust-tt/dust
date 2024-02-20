import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { front_sequelize } from "@app/lib/databases";
import type { Membership } from "@app/lib/models";

export class User extends Model<
  InferAttributes<User>,
  InferCreationAttributes<User>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare provider: "github" | "google";
  declare providerId: string;
  declare username: string;
  declare email: string;
  declare name: string;
  declare firstName: string;
  declare lastName: string | null;
  declare imageUrl: string | null;

  declare isDustSuperUser: CreationOptional<boolean>;

  declare memberships: NonAttribute<Membership[]>;
}
User.init(
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
    provider: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    providerId: {
      type: DataTypes.STRING,
      allowNull: false,
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
      type: DataTypes.STRING,
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
    sequelize: front_sequelize,
    indexes: [{ fields: ["username"] }, { fields: ["provider", "providerId"] }],
  }
);

export class UserMetadata extends Model<
  InferAttributes<UserMetadata>,
  InferCreationAttributes<UserMetadata>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare key: string;
  declare value: string;
  declare userId: ForeignKey<User["id"]>;
}
UserMetadata.init(
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
    sequelize: front_sequelize,
    indexes: [{ fields: ["userId", "key"], unique: true }],
  }
);
User.hasMany(UserMetadata, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
