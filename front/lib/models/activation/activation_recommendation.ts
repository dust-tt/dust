import { ConversationModel } from "@app/lib/models/agent/conversation";
import { TriggerModel } from "@app/lib/models/agent/triggers/triggers";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey } from "sequelize";

export type ActivationRecommendationStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "saved"
  | "recurring";

export class ActivationRecommendationModel extends WorkspaceAwareModel<ActivationRecommendationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare userId: ForeignKey<UserModel["id"]>;
  declare status: ActivationRecommendationStatus;
  declare content: string;
  declare rationale: string;

  declare conversationId: ForeignKey<ConversationModel["id"]> | null;
  // FK to skill_configurations.id — the skill artifact associated with this recommendation.
  declare artifactSkillId: ForeignKey<SkillConfigurationModel["id"]> | null;
  // FK to triggers.id — the trigger artifact associated with this recommendation.
  declare artifactTriggerId: ForeignKey<TriggerModel["id"]> | null;
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
    artifactSkillId: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    artifactTriggerId: {
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
        fields: ["artifactSkillId"],
        concurrently: true,
      },
      {
        fields: ["artifactTriggerId"],
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
  foreignKey: { name: "artifactSkillId", allowNull: true },
  onDelete: "SET NULL",
});
SkillConfigurationModel.hasMany(ActivationRecommendationModel, {
  foreignKey: { name: "artifactSkillId", allowNull: true },
  onDelete: "SET NULL",
});

ActivationRecommendationModel.belongsTo(TriggerModel, {
  foreignKey: { name: "artifactTriggerId", allowNull: true },
  onDelete: "SET NULL",
});
TriggerModel.hasMany(ActivationRecommendationModel, {
  foreignKey: { name: "artifactTriggerId", allowNull: true },
  onDelete: "SET NULL",
});
