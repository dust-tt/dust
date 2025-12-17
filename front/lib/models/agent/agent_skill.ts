import isNil from "lodash/isNil";
import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class AgentSkillModel extends WorkspaceAwareModel<AgentSkillModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare customSkillId: ForeignKey<SkillConfigurationModel["id"]> | null;
  declare globalSkillId: string | null;

  declare agentConfigurationId: ForeignKey<AgentConfigurationModel["id"]>;
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
      // A skill link must reference either a custom skill (workspace-specific, stored in DB)
      // or a global skill (code-defined, referenced by string ID), but never both or neither.
      eitherGlobalOrCustomSkill() {
        const hasCustomSkill = !isNil(this.customSkillId);
        const hasGlobalSkill = !isNil(this.globalSkillId);
        const hasExactlyOne = hasCustomSkill !== hasGlobalSkill;
        if (!hasExactlyOne) {
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
  foreignKey: { name: "agentConfigurationId", allowNull: false },
  onDelete: "RESTRICT",
});
AgentConfigurationModel.hasMany(AgentSkillModel, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
  as: "skillAgentLinks",
});

// Many-to-Many associations
SkillConfigurationModel.belongsToMany(AgentConfigurationModel, {
  through: AgentSkillModel,
  foreignKey: "customSkillId",
  otherKey: "agentConfigurationId",
  as: "AgentConfigurationModels",
});
AgentConfigurationModel.belongsToMany(SkillConfigurationModel, {
  through: AgentSkillModel,
  foreignKey: "agentConfigurationId",
  otherKey: "customSkillId",
  as: "skills",
});
