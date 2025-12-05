import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export const ONBOARDING_TASK_KINDS = [
  "tool_setup_admin",
  "tool_setup_personal",
  "tool_use",
  "learning",
] as const;
export type OnboardingTaskKind = (typeof ONBOARDING_TASK_KINDS)[number];

export class OnboardingTaskModel extends WorkspaceAwareModel<OnboardingTaskModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare context: string;
  declare kind: OnboardingTaskKind;
  declare toolName: string | null;

  declare completedAt: Date | null;
  declare skippedAt: Date | null;

  declare userId: ForeignKey<UserModel["id"]>;
  declare user: NonAttribute<UserModel>;
}

OnboardingTaskModel.init(
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
    context: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    kind: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [ONBOARDING_TASK_KINDS],
      },
    },
    toolName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    skippedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    modelName: "onboarding_tasks",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "userId"],
        name: "onboarding_tasks_workspace_user",
      },
    ],
  }
);

UserModel.hasMany(OnboardingTaskModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});

OnboardingTaskModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
});
