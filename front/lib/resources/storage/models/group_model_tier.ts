import { MODEL_TIERS, type ModelTier } from "@app/lib/api/models_picker/tiers";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey } from "sequelize";

/**
 * Per-(workspace, group) model tier override.
 *
 * When absent, members of the group inherit the workspace default tier unless
 * they have a user-level override.
 */
export class GroupModelTierModel extends WorkspaceAwareModel<GroupModelTierModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare groupId: ForeignKey<GroupModel["id"]>;
  declare tier: ModelTier;
}

GroupModelTierModel.init(
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
    groupId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: GroupModel,
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
    modelName: "group_model_tiers",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "group_model_tiers_workspace_group_unique",
        fields: ["workspaceId", "groupId"],
        unique: true,
        concurrently: true,
      },
      {
        name: "group_model_tiers_group_id",
        fields: ["groupId"],
        concurrently: true,
      },
    ],
  }
);

GroupModel.hasMany(GroupModelTierModel, {
  foreignKey: { name: "groupId", allowNull: false },
  onDelete: "RESTRICT",
});
GroupModelTierModel.belongsTo(GroupModel, {
  foreignKey: { name: "groupId", allowNull: false },
  targetKey: "id",
});
