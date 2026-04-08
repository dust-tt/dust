import { ConversationModel } from "@app/lib/models/agent/conversation";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type {
  SkillSuggestionKind,
  SkillSuggestionPayload,
  SkillSuggestionSource,
  SkillSuggestionState,
} from "@app/types/suggestions/skill_suggestion";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes, Op } from "sequelize";

export class SkillSuggestionModel extends WorkspaceAwareModel<SkillSuggestionModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare skillConfigurationId: ForeignKey<SkillConfigurationModel["id"]>;

  declare kind: SkillSuggestionKind;
  declare suggestion: SkillSuggestionPayload;
  declare analysis: string | null;

  declare state: SkillSuggestionState;
  declare source: SkillSuggestionSource;
  declare sourceConversationId: ForeignKey<ConversationModel["id"]> | null;
  declare groupId: string | null;

  declare skillConfiguration: NonAttribute<SkillConfigurationModel>;
  declare sourceConversation: NonAttribute<ConversationModel | null>;
}

SkillSuggestionModel.init(
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
    skillConfigurationId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    kind: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    suggestion: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    analysis: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    state: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "pending",
    },
    source: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sourceConversationId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      comment:
        "FK to the conversation that triggered this suggestion (only set when applicable, e.g. synthetic)",
    },
    groupId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "skill_suggestion",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "skill_suggestions_list_by_skill_configuration_idx",
        fields: ["workspaceId", "skillConfigurationId", "state", "kind"],
        concurrently: true,
      },
      {
        name: "idx_skill_suggestions_workspace_state",
        fields: ["workspaceId", "state"],
        concurrently: true,
      },
      {
        name: "skill_suggestions_workspace_skill_config_kind",
        fields: ["skillConfigurationId"],
        concurrently: true,
      },
      {
        name: "idx_skill_suggestions_source_conversation_id",
        fields: ["sourceConversationId"],
        concurrently: true,
      },
      {
        name: "idx_skill_suggestions_group",
        fields: ["groupId"],
        concurrently: true,
        where: { groupId: { [Op.ne]: null } },
      },
    ],
  }
);

SkillSuggestionModel.belongsTo(SkillConfigurationModel, {
  foreignKey: { name: "skillConfigurationId", allowNull: false },
  onDelete: "RESTRICT",
  as: "skillConfiguration",
});
SkillConfigurationModel.hasMany(SkillSuggestionModel, {
  foreignKey: { name: "skillConfigurationId", allowNull: false },
  onDelete: "RESTRICT",
  as: "skillSuggestions",
});

SkillSuggestionModel.belongsTo(ConversationModel, {
  foreignKey: { name: "sourceConversationId", allowNull: true },
  onDelete: "RESTRICT",
  as: "sourceConversation",
});
