import type {
  BelongsToGetAssociationMixin,
  CreationOptional,
  ForeignKey,
  NonAttribute,
} from "sequelize";
import { DataTypes } from "sequelize";

import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class AgentSkillModel extends WorkspaceAwareModel<AgentSkillModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare customSkill: NonAttribute<SkillConfigurationModel> | null;
  declare customSkillId: ForeignKey<SkillConfigurationModel["id"]> | null;
  declare globalSkillId: string | null;

  declare agentConfiguration: NonAttribute<AgentConfigurationModel>;
  declare agentConfigurationId: ForeignKey<AgentConfigurationModel["id"]>;

  declare getCustomSkill: BelongsToGetAssociationMixin<SkillConfigurationModel>;
  declare getAgentConfigurationModel: BelongsToGetAssociationMixin<AgentConfigurationModel>;
}

AgentSkillModel.init(
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
    customSkillId: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    globalSkillId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    AgentConfigurationModelId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
  },
  {
    modelName: "agent_skills",
    sequelize: frontSequelize,
    indexes: [{ fields: ["workspaceId", "AgentConfigurationModelId"] }],
    validate: {
      eitherGlobalOrCustomSkill() {
        const hasCustomSkill = this.customSkillId !== null;
        const hasGlobalSkill = this.globalSkillId !== null;
        if (hasCustomSkill === hasGlobalSkill) {
          throw new Error(
            "Exactly one of customSkillId or globalSkillId must be set"
          );
        }
      },
    },
  }
);

// Association with SkillConfiguration
AgentSkillModel.belongsTo(SkillConfigurationModel, {
  foreignKey: { name: "customSkillId", allowNull: true },
  as: "customSkill",
  onDelete: "RESTRICT",
});
SkillConfigurationModel.hasMany(AgentSkillModel, {
  foreignKey: { name: "customSkillId", allowNull: true },
  as: "skillAgentLinks",
  onDelete: "RESTRICT",
});

// Association with AgentConfigurationModel
AgentSkillModel.belongsTo(AgentConfigurationModel, {
  foreignKey: { name: "AgentConfigurationModelId", allowNull: false },
  onDelete: "RESTRICT",
});
AgentConfigurationModel.hasMany(AgentSkillModel, {
  foreignKey: { name: "AgentConfigurationModelId", allowNull: false },
  as: "skillAgentLinks",
});

// Many-to-Many associations
SkillConfigurationModel.belongsToMany(AgentConfigurationModel, {
  through: AgentSkillModel,
  foreignKey: "customSkillId",
  otherKey: "AgentConfigurationModelId",
  as: "AgentConfigurationModels",
});
AgentConfigurationModel.belongsToMany(SkillConfigurationModel, {
  through: AgentSkillModel,
  foreignKey: "AgentConfigurationModelId",
  otherKey: "customSkillId",
  as: "skills",
});
