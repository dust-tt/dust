import { ActivationPodModel } from "@app/lib/models/activation/activation_pod";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { TriggerModel } from "@app/lib/models/agent/triggers/triggers";
import { frontSequelize } from "@app/lib/resources/storage";
import {
  DANGEROUSLY_UNBOUNDED_TEXT,
  DataTypes,
} from "@app/lib/resources/storage/data_types";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey } from "sequelize";

// "posting": the row is claimed, the conversation is being created
// "posted": the nudge conversation exists
// "failed": the nudge could not be posted, see errorMessage
export type ActivationNudgeStatus = "posting" | "posted" | "failed";

// One row = one nudge sent to a Pod.
export class ActivationNudgeModel extends WorkspaceAwareModel<ActivationNudgeModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare status: ActivationNudgeStatus;
  declare errorMessage: string | null;

  // The Pod that was nudged.
  declare spaceId: ForeignKey<SpaceModel["id"]>;
  // The trigger that fired the nudge. Null for nudges posted directly.
  declare triggerId: ForeignKey<TriggerModel["id"]> | null;
  // The user targeted by the nudge.
  declare userId: ForeignKey<UserModel["id"]>;

  // The Pod that was nudged, via ActivationPod. Nullable until backfilled;
  // will replace spaceId/triggerId/userId above once migrated.
  declare activationPodId: ForeignKey<ActivationPodModel["id"]> | null;

  // The conversation the nudge opened. Null while posting, and for nudges that
  // failed to post.
  declare conversationId: ForeignKey<ConversationModel["id"]> | null;
}

ActivationNudgeModel.init(
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
    // Defaults to "posted" so the rows written by the webhook-fired path, which
    // only ever recorded successful fires, read correctly.
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "posted",
    },
    errorMessage: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    modelName: "activation_nudge",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["spaceId"], concurrently: true },
      { fields: ["triggerId"], concurrently: true },
      { fields: ["userId"], concurrently: true },
      { fields: ["activationPodId"], concurrently: true },
      { unique: true, fields: ["conversationId"], concurrently: true },
    ],
  }
);

ActivationNudgeModel.belongsTo(SpaceModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  onDelete: "RESTRICT",
});
SpaceModel.hasMany(ActivationNudgeModel, {
  foreignKey: { name: "spaceId", allowNull: false },
});

ActivationNudgeModel.belongsTo(TriggerModel, {
  foreignKey: { name: "triggerId", allowNull: true },
  onDelete: "SET NULL",
});
TriggerModel.hasMany(ActivationNudgeModel, {
  foreignKey: { name: "triggerId", allowNull: true },
});

ActivationNudgeModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
});
UserModel.hasMany(ActivationNudgeModel, {
  foreignKey: { name: "userId", allowNull: false },
});

ActivationNudgeModel.belongsTo(ActivationPodModel, {
  foreignKey: { name: "activationPodId", allowNull: true },
  onDelete: "RESTRICT",
});
ActivationPodModel.hasMany(ActivationNudgeModel, {
  foreignKey: { name: "activationPodId", allowNull: true },
});

ActivationNudgeModel.belongsTo(ConversationModel, {
  foreignKey: { name: "conversationId", allowNull: true },
  onDelete: "SET NULL",
});
ConversationModel.hasOne(ActivationNudgeModel, {
  foreignKey: { name: "conversationId", allowNull: true },
});
