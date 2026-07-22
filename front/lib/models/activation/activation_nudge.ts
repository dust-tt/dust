import { ActivationPodModel } from "@app/lib/models/activation/activation_pod";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey } from "sequelize";

// One row = one nudge sent to a Pod (i.e. the activation trigger was fired for it).
export class ActivationNudgeModel extends WorkspaceAwareModel<ActivationNudgeModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // The Pod that was nudged.
  declare activationPodId: ForeignKey<ActivationPodModel["id"]>;
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
    indexes: [{ fields: ["activationPodId"], concurrently: true }],
  }
);

ActivationNudgeModel.belongsTo(ActivationPodModel, {
  foreignKey: { name: "activationPodId", allowNull: false },
  onDelete: "RESTRICT",
});
ActivationPodModel.hasMany(ActivationNudgeModel, {
  foreignKey: { name: "activationPodId", allowNull: false },
});
