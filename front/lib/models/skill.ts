import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export type SkillStatus = "active" | "archived";
export type SkillScope = "private" | "workspace";

export class SkillConfigurationModel extends WorkspaceAwareModel<SkillConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare version: number;

  declare status: SkillStatus;
  declare scope: SkillScope;

  declare name: string;
  declare description: string;
  declare instructions: string;

  declare authorId: ForeignKey<UserModel["id"]>;

  declare requestedSpaceIds: number[];

  declare author: NonAttribute<UserModel>;
}

SkillConfigurationModel.init(
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
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    scope: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    instructions: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    requestedSpaceIds: {
      type: DataTypes.ARRAY(DataTypes.BIGINT),
      allowNull: false,
    },
  },
  {
    modelName: "skill_configuration",
    sequelize: frontSequelize,
    indexes: [
      // TODO(skills): add indexes.
    ],
  }
);

// Skill config <> Author
UserModel.hasMany(SkillConfigurationModel, {
  foreignKey: { name: "authorId", allowNull: false },
  onDelete: "RESTRICT",
});
SkillConfigurationModel.belongsTo(UserModel, {
  foreignKey: { name: "authorId", allowNull: false },
  as: "author",
});
