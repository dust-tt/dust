import { SkillConfigurationModel } from "@app/lib/models/skill";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { ProjectMetadataModel } from "@app/lib/resources/storage/models/project_metadata";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey } from "sequelize";

// Mapping table linking a pod to the skills pre-selected as its defaults for new
// conversations. A pod can have many default skills; identified with foreign keys
export class ProjectDefaultSkillModel extends WorkspaceAwareModel<ProjectDefaultSkillModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare projectId: ForeignKey<ProjectMetadataModel["id"]>;
  declare skillConfigurationId: ForeignKey<SkillConfigurationModel["id"]>;
}

ProjectDefaultSkillModel.init(
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
    projectId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    skillConfigurationId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
  },
  {
    modelName: "project_default_skills",
    sequelize: frontSequelize,
    indexes: [
      // Fetch a workspace's or a pod's default skills; also enforces no duplicate
      // (pod, skill) pair.
      {
        name: "project_default_skills_unique",
        unique: true,
        fields: ["workspaceId", "projectId", "skillConfigurationId"],
        concurrently: true,
      },
      // Reverse lookup + FK index for the skill side.
      {
        name: "project_default_skills_skill_configuration_id",
        fields: ["skillConfigurationId"],
        concurrently: true,
      },
    ],
  }
);

ProjectDefaultSkillModel.belongsTo(ProjectMetadataModel, {
  foreignKey: { name: "projectId", allowNull: false },
  targetKey: "id",
});

ProjectDefaultSkillModel.belongsTo(SkillConfigurationModel, {
  foreignKey: { name: "skillConfigurationId", allowNull: false },
  targetKey: "id",
});
