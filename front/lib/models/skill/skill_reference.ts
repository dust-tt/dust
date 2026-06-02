import {
  eitherGlobalOrCustomSkillValidation,
  SkillConfigurationModel,
} from "@app/lib/models/skill";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes, Op } from "sequelize";

export class SkillReferenceModel extends WorkspaceAwareModel<SkillReferenceModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare parentSkillId: ForeignKey<SkillConfigurationModel["id"]>;
  declare childCustomSkillId: ForeignKey<SkillConfigurationModel["id"]> | null;
  declare childGlobalSkillId: string | null;
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
    childCustomSkillId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: {
        model: SkillConfigurationModel,
        key: "id",
      },
    },
    childGlobalSkillId: {
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
        fields: ["workspaceId", "parentSkillId", "childCustomSkillId"],
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
        fields: ["childCustomSkillId"],
        concurrently: true,
      },
      {
        name: "skill_references_child_global_skill_id_idx",
        fields: ["workspaceId", "childGlobalSkillId"],
        where: { childGlobalSkillId: { [Op.ne]: null } },
        concurrently: true,
      },
    ],
    validate: {
      eitherGlobalOrCustomSkill(this: SkillReferenceModel): void {
        eitherGlobalOrCustomSkillValidation.call({
          customSkillId: this.childCustomSkillId,
          globalSkillId: this.childGlobalSkillId,
        });
      },
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
  foreignKey: { name: "childCustomSkillId", allowNull: true },
  as: "childSkill",
  onDelete: "RESTRICT",
});
SkillConfigurationModel.hasMany(SkillReferenceModel, {
  foreignKey: { name: "childCustomSkillId", allowNull: true },
  as: "parentSkillReferences",
  onDelete: "RESTRICT",
});
