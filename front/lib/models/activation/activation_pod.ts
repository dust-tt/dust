import { TriggerModel } from "@app/lib/models/agent/triggers/triggers";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey } from "sequelize";

type uiView = "compact";

// One row = one Activation Pod: a Pod (project space) provisioned by the
// activation flow. Canonical record for a pod's owner and activation trigger,
// replacing the ProjectMetadata provisioningSource flag and the join through
// WebhookSourcesView/Trigger used to resolve a pod's trigger.
export class ActivationPodModel extends WorkspaceAwareModel<ActivationPodModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // The activation pod.
  declare spaceId: ForeignKey<SpaceModel["id"]>;
  // The user for whom we created the activation pod.
  declare userId: ForeignKey<UserModel["id"]>;
  // The Pod's activation trigger. Null until provisioned.
  declare triggerId: ForeignKey<TriggerModel["id"]> | null;
  // The Pod's UI variant. Null for the standard UI.
  declare uiView: CreationOptional<uiView | null>;
}

ActivationPodModel.init(
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
    uiView: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    modelName: "activation_pod",
    sequelize: frontSequelize,
    indexes: [
      { unique: true, fields: ["spaceId"], concurrently: true },
      { fields: ["userId"], concurrently: true },
      { unique: true, fields: ["triggerId"], concurrently: true },
    ],
  }
);

ActivationPodModel.belongsTo(SpaceModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  onDelete: "RESTRICT",
});
SpaceModel.hasOne(ActivationPodModel, {
  foreignKey: { name: "spaceId", allowNull: false },
});

ActivationPodModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
});
UserModel.hasMany(ActivationPodModel, {
  foreignKey: { name: "userId", allowNull: false },
});

ActivationPodModel.belongsTo(TriggerModel, {
  foreignKey: { name: "triggerId", allowNull: true },
  onDelete: "SET NULL",
});
TriggerModel.hasOne(ActivationPodModel, {
  foreignKey: { name: "triggerId", allowNull: true },
});
