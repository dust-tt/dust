import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { SkillConfigurationModel } from "@app/lib/models/skill";
import { frontSequelize } from "@app/lib/resources/storage";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class GroupSkillModel extends WorkspaceAwareModel<GroupSkillModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare groupId: ForeignKey<GroupModel["id"]>;
  declare skillConfigurationId: ForeignKey<SkillConfigurationModel["id"]>;
}

GroupSkillModel.init(
  {
    id: {
      type: DataTypes.BIGINT,
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
    groupId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    skillConfigurationId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
  },
  {
    modelName: "group_skills",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId"],
        concurrently: true,
      },
      {
        unique: true,
        fields: ["groupId", "skillConfigurationId"],
        concurrently: true,
      },
      {
        fields: ["workspaceId", "skillConfigurationId"],
        concurrently: true,
      },
    ],
  }
);

GroupSkillModel.belongsTo(GroupModel, {
  foreignKey: { name: "groupId", allowNull: false },
  targetKey: "id",
});

GroupModel.hasMany(GroupSkillModel, {
  foreignKey: { name: "groupId", allowNull: false },
  sourceKey: "id",
  as: "groupSkillLinks",
});

GroupSkillModel.belongsTo(SkillConfigurationModel, {
  foreignKey: { name: "skillConfigurationId", allowNull: false },
  targetKey: "id",
});

SkillConfigurationModel.hasMany(GroupSkillModel, {
  foreignKey: { name: "skillConfigurationId", allowNull: false },
  sourceKey: "id",
  as: "skillGroupLinks",
});
