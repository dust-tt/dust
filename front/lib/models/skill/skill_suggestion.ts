import { ConversationModel } from "@app/lib/models/agent/conversation";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
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
  declare title: string | null;

  declare state: SkillSuggestionState;
  declare source: SkillSuggestionSource;
  declare sourceConversationIds: number[] | null;
  declare groupId: string | null;
  declare updatedByUserId: ForeignKey<UserModel["id"]> | null;
  declare notificationConversationModelId: ForeignKey<
    ConversationModel["id"]
  > | null;

  declare skillConfiguration: NonAttribute<SkillConfigurationModel>;
  declare updatedByUser: NonAttribute<UserModel | null>;
  declare notificationConversation: NonAttribute<ConversationModel | null>;
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
    title: {
      type: DataTypes.STRING,
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
    sourceConversationIds: {
      type: DataTypes.ARRAY(DataTypes.BIGINT),
      allowNull: true,
      comment:
        "Array of conversation model IDs that contributed to this reinforcement suggestion.",
    },
    groupId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    updatedByUserId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: {
        model: UserModel,
        key: "id",
      },
    },
    notificationConversationModelId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: {
        model: ConversationModel,
        key: "id",
      },
      field: "notificationConversationId",
      comment:
        "Conversation created to notify editors about this reinforcement suggestion.",
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
        name: "idx_skill_suggestions_group",
        fields: ["groupId"],
        concurrently: true,
        where: { groupId: { [Op.ne]: null } },
      },
      {
        name: "idx_skill_suggestions_updated_by_user_id",
        fields: ["updatedByUserId"],
        concurrently: true,
        where: { updatedByUserId: { [Op.ne]: null } },
      },
      {
        name: "idx_skill_suggestions_notification_conversation_id",
        fields: ["notificationConversationId"],
        concurrently: true,
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

UserModel.hasMany(SkillSuggestionModel, {
  foreignKey: { name: "updatedByUserId", allowNull: true },
  onDelete: "SET NULL",
});
SkillSuggestionModel.belongsTo(UserModel, {
  foreignKey: { name: "updatedByUserId", allowNull: true },
  as: "updatedByUser",
});

SkillSuggestionModel.belongsTo(ConversationModel, {
  foreignKey: { name: "notificationConversationId", allowNull: true },
  onDelete: "SET NULL",
  as: "notificationConversation",
});
ConversationModel.hasMany(SkillSuggestionModel, {
  foreignKey: { name: "notificationConversationId", allowNull: true },
  onDelete: "SET NULL",
});
