import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey } from "sequelize";

// One row = one Activation Pod: a Pod (project space) provisioned by the
// activation flow. Canonical record for a pod's owner and nudge settings.
export class ActivationPodModel extends WorkspaceAwareModel<ActivationPodModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // The activation pod.
  declare spaceId: ForeignKey<SpaceModel["id"]>;
  // The user for whom we created the activation pod.
  declare userId: ForeignKey<UserModel["id"]>;
  // When the user turned nudges off for this Pod. Null while they are on.
  declare nudgesDisabledAt: Date | null;
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
    nudgesDisabledAt: {
      type: DataTypes.DATE,
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
