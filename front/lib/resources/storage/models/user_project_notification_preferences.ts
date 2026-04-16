import { frontSequelize } from "@app/lib/resources/storage";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import {
  NOTIFICATION_CONDITION_OPTIONS,
  type NotificationCondition,
} from "@app/types/notification_preferences";
import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

export class UserProjectNotificationPreferenceModel extends WorkspaceAwareModel<UserProjectNotificationPreferenceModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare userId: ForeignKey<UserModel["id"]>;
  declare spaceId: ForeignKey<SpaceModel["id"]>;
  declare preference: NotificationCondition;
}

UserProjectNotificationPreferenceModel.init(
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
    preference: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [NOTIFICATION_CONDITION_OPTIONS],
      },
    },
  },
  {
    modelName: "user_project_notification_preferences",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "user_project_notif_pref_workspace_user_space_unique",
        fields: ["workspaceId", "userId", "spaceId"],
        unique: true,
        concurrently: true,
      },
      { fields: ["userId"], concurrently: true },
      { fields: ["spaceId"], concurrently: true },
    ],
  }
);

UserModel.hasMany(UserProjectNotificationPreferenceModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
UserProjectNotificationPreferenceModel.belongsTo(UserModel, {
  foreignKey: { allowNull: false },
});

SpaceModel.hasMany(UserProjectNotificationPreferenceModel, {
  foreignKey: { allowNull: false, name: "spaceId" },
  onDelete: "RESTRICT",
});
UserProjectNotificationPreferenceModel.belongsTo(SpaceModel, {
  foreignKey: { allowNull: false, name: "spaceId" },
});
