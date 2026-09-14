import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { ProjectMetadataModel } from "@app/lib/resources/storage/models/project_metadata";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";

export const ACTIVATION_POD_KINDS = ["learning", "goal"] as const;
export type ActivationPodKind = (typeof ACTIVATION_POD_KINDS)[number];

// One row = one Activation Pod: a Pod (project space) provisioned by the
// activation flow. Canonical record for a pod's owner.
export class ActivationPodModel extends WorkspaceAwareModel<ActivationPodModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // The activation pod.
  declare spaceId: ForeignKey<SpaceModel["id"]>;
  // The user for whom we created the activation pod.
  declare userId: ForeignKey<UserModel["id"]>;
  declare kind: CreationOptional<ActivationPodKind>;

  declare projectMetadata?: NonAttribute<ProjectMetadataModel>;
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
    kind: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "learning",
      validate: {
        isIn: [ACTIVATION_POD_KINDS],
      },
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

ActivationPodModel.belongsTo(ProjectMetadataModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  targetKey: "spaceId",
  as: "projectMetadata",
  constraints: false,
});

ActivationPodModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
});
UserModel.hasMany(ActivationPodModel, {
  foreignKey: { name: "userId", allowNull: false },
});
