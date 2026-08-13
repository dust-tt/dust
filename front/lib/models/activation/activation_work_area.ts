import { ActivationPodModel } from "@app/lib/models/activation/activation_pod";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey } from "sequelize";

export const ACTIVATION_WORK_AREA_STATUSES = [
  "suggested",
  "dismissed",
  // Legacy values still present on existing rows. Treat as `suggested`.
  "candidate",
  "confirmed",
] as const;

export type ActivationWorkAreaStatus =
  (typeof ACTIVATION_WORK_AREA_STATUSES)[number];

export type PublicActivationWorkAreaStatus = "suggested" | "dismissed";

export function publicActivationWorkAreaStatus(
  status: ActivationWorkAreaStatus
): PublicActivationWorkAreaStatus {
  return status === "dismissed" ? "dismissed" : "suggested";
}

export function matchingActivationWorkAreaStatuses(
  status: PublicActivationWorkAreaStatus
): ActivationWorkAreaStatus[] {
  if (status === "dismissed") {
    return ["dismissed"];
  }
  return ["suggested", "candidate", "confirmed"];
}

export class ActivationWorkAreaModel extends WorkspaceAwareModel<ActivationWorkAreaModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare userId: ForeignKey<UserModel["id"]>;
  declare podId: ForeignKey<ActivationPodModel["id"]> | null;

  declare title: string;
  declare description: string;
  declare status: ActivationWorkAreaStatus;
}

ActivationWorkAreaModel.init(
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
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING(512),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
  },
  {
    modelName: "activation_work_area",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["userId"], concurrently: true },
      { fields: ["podId"], concurrently: true },
      { fields: ["workspaceId", "userId", "status"], concurrently: true },
    ],
  }
);

ActivationWorkAreaModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
});
UserModel.hasMany(ActivationWorkAreaModel, {
  foreignKey: { name: "userId", allowNull: false },
});

ActivationWorkAreaModel.belongsTo(ActivationPodModel, {
  foreignKey: { name: "podId", allowNull: true },
  onDelete: "RESTRICT",
});
ActivationPodModel.hasMany(ActivationWorkAreaModel, {
  foreignKey: { name: "podId", allowNull: true },
});
