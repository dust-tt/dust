import {
  CreationOptional,
  DataTypes,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";

import { front_sequelize } from "@app/lib/databases";
import { User } from "@app/lib/models/user";
import { Workspace } from "@app/lib/models/workspace";

export class GensTemplate extends Model<
  InferAttributes<GensTemplate>,
  InferCreationAttributes<GensTemplate>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare workspaceId: ForeignKey<Workspace["id"]>;
  declare userId: ForeignKey<User["id"]>;
  declare instructions2: string;
  declare name: string;
  declare visibility: "user" | "workspace";
  declare color: string;
  declare sId: string;
}

GensTemplate.init(
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
    instructions2: {
      type: DataTypes.TEXT,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    visibility: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    color: {
      type: DataTypes.STRING,
    },
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "gens_template",
    sequelize: front_sequelize,
    indexes: [{ fields: ["workspaceId", "sId"], unique: true }],
  }
);

User.hasMany(GensTemplate);
Workspace.hasMany(GensTemplate);
