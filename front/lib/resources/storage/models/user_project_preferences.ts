import { frontSequelize } from "@app/lib/resources/storage";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import {
  NOTIFICATION_CONDITION_OPTIONS,
  type NotificationCondition,
} from "@app/types/notification_preferences";
import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "@app/lib/resources/storage/data_types";

export class UserProjectPreferencesModel extends WorkspaceAwareModel<UserProjectPreferencesModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare userId: ForeignKey<UserModel["id"]>;
  declare spaceId: ForeignKey<SpaceModel["id"]>;
  declare notificationPreference: NotificationCondition | null;
  declare isStarred: boolean | null;
}

UserProjectPreferencesModel.init(
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
    notificationPreference: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isIn: [NOTIFICATION_CONDITION_OPTIONS],
      },
    },
    isStarred: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
  },
  {
    modelName: "user_project_preferences",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "user_project_preferences_workspace_user_space_unique",
        fields: ["workspaceId", "userId", "spaceId"],
        unique: true,
        concurrently: true,
      },
      { fields: ["workspaceId", "spaceId"], concurrently: true },
    ],
  }
);

UserModel.hasMany(UserProjectPreferencesModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
UserProjectPreferencesModel.belongsTo(UserModel, {
  foreignKey: { allowNull: false },
});

SpaceModel.hasMany(UserProjectPreferencesModel, {
  foreignKey: { allowNull: false, name: "spaceId" },
  onDelete: "RESTRICT",
});
UserProjectPreferencesModel.belongsTo(SpaceModel, {
  foreignKey: { allowNull: false, name: "spaceId" },
});
