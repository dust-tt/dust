import { ActivationPodModel } from "@app/lib/models/activation/activation_pod";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { TriggerModel } from "@app/lib/models/agent/triggers/triggers";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";

// "suggested": shown to the user, no action taken yet
// "executed": user ran the recommended action immediately (one-off)
// "dismissed": user declined the recommendation
// Creation outcomes are tracked independently via createdSkillId / createdTriggerId (either or both can be set)
export type ActivationRecommendationStatus =
  | "suggested"
  | "executed"
  | "dismissed";

export class ActivationRecommendationModel extends WorkspaceAwareModel<ActivationRecommendationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare userId: ForeignKey<UserModel["id"]>;
  // The Pod the recommendation was made in. Nullable until backfilled.
  declare activationPodId: ForeignKey<ActivationPodModel["id"]> | null;
  declare status: ActivationRecommendationStatus;
  declare title: string;
  declare content: string;
  declare body: string | null;
  declare steps: string[] | null;
  declare ctaLabel: string | null;
  declare sourceIcon: string | null;
  declare sourceLabel: string | null;
  // Set after the user answers Useful / Not Useful on an executed recommendation.
  declare isUseful: boolean | null;

  // The conversation in which the recommendation was (originally) made
  declare conversationId: ForeignKey<ConversationModel["id"]> | null;
  declare conversation?: NonAttribute<ConversationModel>;
  // FK to the skill created as a result of this recommendation (set when status = "skill_created")
  declare createdSkillId: ForeignKey<SkillConfigurationModel["id"]> | null;
  // FK to the trigger created as a result of this recommendation (set when status = "trigger_created")
  declare createdTriggerId: ForeignKey<TriggerModel["id"]> | null;
}

ActivationRecommendationModel.init(
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
    userId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    activationPodId: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(4096),
      allowNull: false,
    },
    content: {
      type: DataTypes.STRING(4096),
      allowNull: false,
    },
    body: {
      type: DataTypes.STRING(1024),
      allowNull: true,
    },
    steps: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    ctaLabel: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    sourceIcon: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    sourceLabel: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    isUseful: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    conversationId: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    createdSkillId: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    createdTriggerId: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
  },
  {
    modelName: "activation_recommendation",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "activation_recommendations_workspace_user_idx",
        fields: ["workspaceId", "userId"],
        concurrently: true,
      },
      {
        fields: ["userId"],
        concurrently: true,
      },
      {
        fields: ["activationPodId"],
        concurrently: true,
      },
      {
        fields: ["conversationId"],
        concurrently: true,
      },
      {
        fields: ["createdSkillId"],
        concurrently: true,
      },
      {
        fields: ["createdTriggerId"],
        concurrently: true,
      },
    ],
  }
);

ActivationRecommendationModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
});
UserModel.hasMany(ActivationRecommendationModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
});

ActivationRecommendationModel.belongsTo(ActivationPodModel, {
  foreignKey: { name: "activationPodId", allowNull: true },
  onDelete: "RESTRICT",
});
ActivationPodModel.hasMany(ActivationRecommendationModel, {
  foreignKey: { name: "activationPodId", allowNull: true },
});

ActivationRecommendationModel.belongsTo(ConversationModel, {
  foreignKey: { name: "conversationId", allowNull: true },
  onDelete: "SET NULL",
});
ConversationModel.hasMany(ActivationRecommendationModel, {
  foreignKey: { name: "conversationId", allowNull: true },
  onDelete: "SET NULL",
});

ActivationRecommendationModel.belongsTo(SkillConfigurationModel, {
  foreignKey: { name: "createdSkillId", allowNull: true },
  onDelete: "SET NULL",
});
SkillConfigurationModel.hasMany(ActivationRecommendationModel, {
  foreignKey: { name: "createdSkillId", allowNull: true },
  onDelete: "SET NULL",
});

ActivationRecommendationModel.belongsTo(TriggerModel, {
  foreignKey: { name: "createdTriggerId", allowNull: true },
  onDelete: "SET NULL",
});
TriggerModel.hasMany(ActivationRecommendationModel, {
  foreignKey: { name: "createdTriggerId", allowNull: true },
  onDelete: "SET NULL",
});
