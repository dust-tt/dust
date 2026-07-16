import { TriggerModel } from "@app/lib/models/agent/triggers/triggers";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey } from "sequelize";

// One row = one nudge sent to a Pod (i.e. the activation trigger was fired for it).
export class ActivationNudgeModel extends WorkspaceAwareModel<ActivationNudgeModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // The Pod that was nudged.
  declare spaceId: ForeignKey<SpaceModel["id"]>;
  // The trigger that fired the nudge.
  declare triggerId: ForeignKey<TriggerModel["id"]>;
  // The user targeted by the nudge.
  declare userId: ForeignKey<UserModel["id"]>;
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
  foreignKey: { name: "triggerId", allowNull: false },
  onDelete: "RESTRICT",
});
TriggerModel.hasMany(ActivationNudgeModel, {
  foreignKey: { name: "triggerId", allowNull: false },
});

ActivationNudgeModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
});
UserModel.hasMany(ActivationNudgeModel, {
  foreignKey: { name: "userId", allowNull: false },
});
