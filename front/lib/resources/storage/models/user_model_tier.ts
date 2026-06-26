import { MODEL_TIERS, type ModelTier } from "@app/lib/api/models_picker/tiers";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey } from "sequelize";

/**
 * Per-(workspace, user) model tier override.
 *
 * When absent, the user's effective tier falls back to their group tier (if any)
 * and then the workspace default.
 */
export class UserModelTierModel extends WorkspaceAwareModel<UserModelTierModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare userId: ForeignKey<UserModel["id"]>;
  declare tier: ModelTier;
}

UserModelTierModel.init(
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
    userId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: UserModel,
        key: "id",
      },
    },
    tier: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [MODEL_TIERS],
      },
    },
  },
  {
    modelName: "user_model_tiers",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "user_model_tiers_workspace_user_unique",
        fields: ["workspaceId", "userId"],
        unique: true,
        concurrently: true,
      },
      {
        name: "user_model_tiers_user_id",
        fields: ["userId"],
        concurrently: true,
      },
    ],
  }
);

UserModel.hasMany(UserModelTierModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
});
UserModelTierModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: false },
  targetKey: "id",
});
