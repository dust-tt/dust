import { ConversationModel } from "@app/lib/models/agent/conversation";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey } from "sequelize";

export class SelfImprovingSkillsUsageModel extends WorkspaceAwareModel<SelfImprovingSkillsUsageModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare skillId: ForeignKey<SkillConfigurationModel["id"]> | null;
  declare conversationId: ForeignKey<ConversationModel["id"]> | null;
  // Old deprecated Micro USD values, kept for legacy workspaces not
  // yet using metronome.
  // margin not included
  declare priceMicroUsd: number;
  // AWU credits as billed to Metronome (margin baked in). 0 on rows recorded
  // before the column was introduced.
  declare priceAwuCredits: CreationOptional<number>;
}

SelfImprovingSkillsUsageModel.init(
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
    skillId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: {
        model: SkillConfigurationModel,
        key: "id",
      },
    },
    conversationId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: {
        model: ConversationModel,
        key: "id",
      },
    },
    priceMicroUsd: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    priceAwuCredits: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    modelName: "self_improving_skills_usage",
    tableName: "self_improving_skills_usage",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "createdAt"],
        name: "self_improving_skills_usage_workspace_created_at_idx",
      },
      {
        fields: ["workspaceId", "skillId", "createdAt"],
        name: "self_imp_skills_usage_workspace_skill_created_at_idx",
      },
      {
        fields: ["conversationId"],
        name: "self_improving_skills_usage_conversation_id_idx",
        concurrently: true,
      },
    ],
  }
);

SkillConfigurationModel.hasMany(SelfImprovingSkillsUsageModel, {
  foreignKey: { name: "skillId", allowNull: true },
  onDelete: "SET NULL",
});
SelfImprovingSkillsUsageModel.belongsTo(SkillConfigurationModel, {
  foreignKey: { name: "skillId", allowNull: true },
  onDelete: "SET NULL",
});

ConversationModel.hasMany(SelfImprovingSkillsUsageModel, {
  foreignKey: { name: "conversationId", allowNull: true },
  onDelete: "SET NULL",
});
SelfImprovingSkillsUsageModel.belongsTo(ConversationModel, {
  foreignKey: { name: "conversationId", allowNull: true },
  onDelete: "SET NULL",
});
