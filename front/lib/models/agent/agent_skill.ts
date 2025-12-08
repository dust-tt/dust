import type {
  BelongsToGetAssociationMixin,
  CreationOptional,
  ForeignKey,
  NonAttribute,
} from "sequelize";
import { DataTypes } from "sequelize";

import { AgentConfiguration } from "@app/lib/models/agent/agent";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class AgentSkillModel extends WorkspaceAwareModel<AgentSkillModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare customSkill: NonAttribute<SkillConfigurationModel> | null;
  declare customSkillId: ForeignKey<SkillConfigurationModel["id"]> | null;
  declare globalSkillId: string | null;

  declare agentConfiguration: NonAttribute<AgentConfiguration>;
  declare agentConfigurationId: ForeignKey<AgentConfiguration["id"]>;

  declare getCustomSkill: BelongsToGetAssociationMixin<SkillConfigurationModel>;
  declare getAgentConfiguration: BelongsToGetAssociationMixin<AgentConfiguration>;
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
    agentConfigurationId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
  },
  {
    modelName: "agent_skills",
    sequelize: frontSequelize,
    indexes: [{ fields: ["workspaceId", "agentConfigurationId"] }],
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
  as: "agentSkillLinks",
  onDelete: "RESTRICT",
});

// Association with AgentConfiguration
AgentSkillModel.belongsTo(AgentConfiguration, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
  onDelete: "RESTRICT",
});
AgentConfiguration.hasMany(AgentSkillModel, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
  as: "agentSkillLinks",
});

// Many-to-Many associations
SkillConfigurationModel.belongsToMany(AgentConfiguration, {
  through: AgentSkillModel,
  foreignKey: "customSkillId",
  otherKey: "agentConfigurationId",
  as: "agentConfigurations",
});
AgentConfiguration.belongsToMany(SkillConfigurationModel, {
  through: AgentSkillModel,
  foreignKey: "agentConfigurationId",
  otherKey: "customSkillId",
  as: "skills",
});
