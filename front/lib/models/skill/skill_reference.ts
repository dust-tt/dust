import { SkillConfigurationModel } from "@app/lib/models/skill";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes, Op } from "sequelize";

export class SkillReferenceModel extends WorkspaceAwareModel<SkillReferenceModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare parentSkillId: ForeignKey<SkillConfigurationModel["id"]>;
  declare childSkillId: ForeignKey<SkillConfigurationModel["id"]> | null;
  declare globalSkillId: string | null;
}

function eitherGlobalOrCustomChildSkillValidation(
  this: SkillReferenceModel
): void {
  const hasCustomChildSkill =
    this.childSkillId !== null && this.childSkillId !== undefined;
  const hasGlobalSkill =
    this.globalSkillId !== null && this.globalSkillId !== undefined;
  const hasExactlyOne = hasCustomChildSkill !== hasGlobalSkill;

  if (!hasExactlyOne) {
    throw new Error("Exactly one of childSkillId or globalSkillId must be set");
  }
}

SkillReferenceModel.init(
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
    parentSkillId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: SkillConfigurationModel,
        key: "id",
      },
    },
    childSkillId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: {
        model: SkillConfigurationModel,
        key: "id",
      },
    },
    globalSkillId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "skill_reference",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "skill_references_workspace_parent_child_idx",
        fields: ["workspaceId", "parentSkillId", "childSkillId"],
        unique: true,
        concurrently: true,
      },
      {
        name: "skill_references_parent_skill_id_idx",
        fields: ["parentSkillId"],
        concurrently: true,
      },
      {
        name: "skill_references_child_skill_id_idx",
        fields: ["childSkillId"],
        concurrently: true,
      },
      {
        name: "skill_references_global_skill_id_idx",
        fields: ["workspaceId", "globalSkillId"],
        where: { globalSkillId: { [Op.ne]: null } },
        concurrently: true,
      },
      {
        name: "skill_references_workspace_parent_global_idx",
        fields: ["workspaceId", "parentSkillId", "globalSkillId"],
        where: { globalSkillId: { [Op.ne]: null } },
        unique: true,
        concurrently: true,
      },
    ],
    validate: {
      eitherGlobalOrCustomChildSkill: eitherGlobalOrCustomChildSkillValidation,
    },
  }
);

SkillReferenceModel.belongsTo(SkillConfigurationModel, {
  foreignKey: { name: "parentSkillId", allowNull: false },
  as: "parentSkill",
  onDelete: "RESTRICT",
});
SkillConfigurationModel.hasMany(SkillReferenceModel, {
  foreignKey: { name: "parentSkillId", allowNull: false },
  as: "childSkillReferences",
  onDelete: "RESTRICT",
});

SkillReferenceModel.belongsTo(SkillConfigurationModel, {
  foreignKey: { name: "childSkillId", allowNull: true },
  as: "childSkill",
  onDelete: "RESTRICT",
});
SkillConfigurationModel.hasMany(SkillReferenceModel, {
  foreignKey: { name: "childSkillId", allowNull: true },
  as: "parentSkillReferences",
  onDelete: "RESTRICT",
});
