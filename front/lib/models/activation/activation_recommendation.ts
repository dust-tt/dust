import { ConversationModel } from "@app/lib/models/agent/conversation";
import { TriggerModel } from "@app/lib/models/agent/triggers/triggers";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey } from "sequelize";

// "suggested": shown to the user, no action taken yet
// "executed": user ran the recommended action immediately (one-off)
// "dismissed": user declined the recommendation
// Creation outcomes are tracked independently via createdSkillId / createdTriggerId (either or both can be set)
export type ActivationRecommendationStatus =
  | "suggested"
  | "executed"
  | "dismissed";

// "user": recommendation surfaced organically in a user's conversation
// "system": recommendation proactively generated and delivered by the orchestrator
export type ActivationRecommendationOrigin = "user" | "system";

export class ActivationRecommendationModel extends WorkspaceAwareModel<ActivationRecommendationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare userId: ForeignKey<UserModel["id"]>;
  declare status: ActivationRecommendationStatus;
  declare origin: ActivationRecommendationOrigin;
  declare content: string;
  declare rationale: string;

  // The conversation in which the recommendation was (originally) made
  declare conversationId: ForeignKey<ConversationModel["id"]> | null;
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
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    origin: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    content: {
      type: DataTypes.STRING(4096),
      allowNull: false,
    },
    rationale: {
      type: DataTypes.STRING(4096),
      allowNull: false,
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
        fields: ["userId"],
        concurrently: true,
      },
      {
        fields: ["workspaceId"],
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
      {
        fields: ["workspaceId", "userId", "origin", "createdAt"],
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
