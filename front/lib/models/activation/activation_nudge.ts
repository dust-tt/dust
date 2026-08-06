import { ActivationPodModel } from "@app/lib/models/activation/activation_pod";
import { TriggerModel } from "@app/lib/models/agent/triggers/triggers";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey } from "sequelize";

// One row = one nudge sent to a Pod.
export class ActivationNudgeModel extends WorkspaceAwareModel<ActivationNudgeModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // The Pod that was nudged.
  declare spaceId: ForeignKey<SpaceModel["id"]>;
  // The trigger that fired the nudge. Null for nudges posted directly.
  declare triggerId: ForeignKey<TriggerModel["id"]> | null;
  // The user targeted by the nudge.
  declare userId: ForeignKey<UserModel["id"]>;

  // The Pod that was nudged, via ActivationPod. Nullable until backfilled;
  // will replace spaceId/triggerId/userId above once migrated.
  declare activationPodId: ForeignKey<ActivationPodModel["id"]> | null;
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
  },
  {
    modelName: "activation_nudge",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["spaceId"], concurrently: true },
      { fields: ["triggerId"], concurrently: true },
      { fields: ["userId"], concurrently: true },
      { fields: ["activationPodId"], concurrently: true },
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
