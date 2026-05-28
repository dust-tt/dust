import { SkillConfigurationModel } from "@app/lib/models/skill";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

export class SkillReferenceModel extends WorkspaceAwareModel<SkillReferenceModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare parentSkillId: ForeignKey<SkillConfigurationModel["id"]>;
  declare childSkillId: ForeignKey<SkillConfigurationModel["id"]>;
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
      allowNull: false,
      references: {
        model: SkillConfigurationModel,
        key: "id",
      },
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
    ],
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
  foreignKey: { name: "childSkillId", allowNull: false },
  as: "childSkill",
  onDelete: "RESTRICT",
});
SkillConfigurationModel.hasMany(SkillReferenceModel, {
  foreignKey: { name: "childSkillId", allowNull: false },
  as: "parentSkillReferences",
  onDelete: "RESTRICT",
});
