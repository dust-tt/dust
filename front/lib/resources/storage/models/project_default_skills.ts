import {
  globalOrCustomSkillValidation,
  SkillConfigurationModel,
} from "@app/lib/models/skill";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes, Op } from "@app/lib/resources/storage/data_types";
import { ProjectMetadataModel } from "@app/lib/resources/storage/models/project_metadata";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey } from "sequelize";

// Mapping table linking a pod to the skills pre-selected as its defaults for new
// conversations. A pod can have many default skills.
export class ProjectDefaultSkillModel extends WorkspaceAwareModel<ProjectDefaultSkillModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare projectId: ForeignKey<ProjectMetadataModel["id"]>;
  declare customSkillId: ForeignKey<SkillConfigurationModel["id"]> | null;
  declare globalSkillId: string | null;
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
    customSkillId: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    globalSkillId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "project_default_skills",
    sequelize: frontSequelize,
    indexes: [
      // Fetch a pod's default skills.
      { fields: ["workspaceId", "projectId"], concurrently: true },
      // No duplicate (pod, custom skill) pair; also serves the reverse FK lookup
      // on the custom skill side.
      {
        name: "project_default_skills_custom_skill_unique",
        unique: true,
        fields: ["workspaceId", "projectId", "customSkillId"],
        where: { customSkillId: { [Op.ne]: null } },
        concurrently: true,
      },
      // No duplicate (pod, global skill) pair.
      {
        name: "project_default_skills_global_skill_unique",
        unique: true,
        fields: ["workspaceId", "projectId", "globalSkillId"],
        where: { globalSkillId: { [Op.ne]: null } },
        concurrently: true,
      },
      // FK index for the custom skill side (skill deletion scans).
      {
        name: "project_default_skills_custom_skill_id",
        fields: ["customSkillId"],
        where: { customSkillId: { [Op.ne]: null } },
        concurrently: true,
      },
    ],
    validate: {
      globalOrCustomSkill: globalOrCustomSkillValidation,
    },
  }
);

ProjectDefaultSkillModel.belongsTo(ProjectMetadataModel, {
  foreignKey: { name: "projectId", allowNull: false },
  targetKey: "id",
  onDelete: "RESTRICT",
});

ProjectDefaultSkillModel.belongsTo(SkillConfigurationModel, {
  foreignKey: { name: "customSkillId", allowNull: true },
  targetKey: "id",
  onDelete: "RESTRICT",
});
