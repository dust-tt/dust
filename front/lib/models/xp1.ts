import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { xp1_sequelize } from "@app/lib/databases";

export class XP1User extends Model<
  InferAttributes<XP1User>,
  InferCreationAttributes<XP1User>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: string;
  declare email: string;
  declare secret: string;
}

XP1User.init(
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
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    secret: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "user",
    sequelize: xp1_sequelize,
    indexes: [{ fields: ["secret"] }],
  }
);

export class XP1Run extends Model<
  InferAttributes<XP1Run>,
  InferCreationAttributes<XP1Run>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare dustUser: string;
  declare dustAppId: string;
  declare dustRunId: string;
  declare runStatus: string;
  declare promptTokens: number;
  declare completionTokens: number;

  declare userId: ForeignKey<XP1User["id"]>;
}

XP1Run.init(
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
    dustUser: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dustAppId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dustRunId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    runStatus: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    promptTokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    completionTokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    modelName: "run",
    sequelize: xp1_sequelize,
    indexes: [{ fields: ["userId"] }],
  }
);
XP1User.hasMany(XP1Run);
