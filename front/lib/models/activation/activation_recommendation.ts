import { ConversationModel } from "@app/lib/models/agent/conversation";
import { TriggerModel } from "@app/lib/models/agent/triggers/triggers";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";

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

  declare conversationModelId: ForeignKey<ConversationModel["id"]> | null;
  declare skillModelId: ForeignKey<SkillConfigurationModel["id"]> | null;
  declare triggerModelId: ForeignKey<TriggerModel["id"]> | null;

  declare user: NonAttribute<UserModel>;
  declare conversation: NonAttribute<ConversationModel | null>;
  declare skillConfiguration: NonAttribute<SkillConfigurationModel | null>;
  declare trigger: NonAttribute<TriggerModel | null>;
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
      defaultValue: "pending",
    },
    content: {
      type: DataTypes.STRING(4096),
      allowNull: false,
    },
    rationale: {
      type: DataTypes.STRING(4096),
      allowNull: false,
    },
    conversationModelId: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    skillModelId: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    triggerModelId: {
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
        fields: ["conversationModelId"],
        concurrently: true,
      },
      {
        fields: ["skillModelId"],
        concurrently: true,
      },
      {
        fields: ["triggerModelId"],
        concurrently: true,
      },
    ],
  }
);

ActivationRecommendationModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
  as: "user",
});
UserModel.hasMany(ActivationRecommendationModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
});

ActivationRecommendationModel.belongsTo(ConversationModel, {
  foreignKey: { name: "conversationModelId", allowNull: true },
  onDelete: "SET NULL",
  as: "conversation",
});
ConversationModel.hasMany(ActivationRecommendationModel, {
  foreignKey: { name: "conversationModelId", allowNull: true },
  onDelete: "SET NULL",
});

ActivationRecommendationModel.belongsTo(SkillConfigurationModel, {
  foreignKey: { name: "skillModelId", allowNull: true },
  onDelete: "SET NULL",
  as: "skillConfiguration",
});
SkillConfigurationModel.hasMany(ActivationRecommendationModel, {
  foreignKey: { name: "skillModelId", allowNull: true },
  onDelete: "SET NULL",
});

ActivationRecommendationModel.belongsTo(TriggerModel, {
  foreignKey: { name: "triggerModelId", allowNull: true },
  onDelete: "SET NULL",
  as: "trigger",
});
TriggerModel.hasMany(ActivationRecommendationModel, {
  foreignKey: { name: "triggerModelId", allowNull: true },
  onDelete: "SET NULL",
});
