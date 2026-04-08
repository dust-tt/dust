import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { ModelId } from "@app/types/shared/model_id";
import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

export class FeatureFlagModel extends WorkspaceAwareModel<FeatureFlagModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: WhitelistableFeature;
  declare groupIds: ModelId[] | null;
}

FeatureFlagModel.init(
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
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    groupIds: {
      type: DataTypes.ARRAY(DataTypes.INTEGER),
      allowNull: true,
      defaultValue: null,
      comment:
        "Per-group feature flag targeting. NULL means workspace-wide (current behavior), an array of group IDs means the flag is only enabled for users who belong to at least one of those groups.",
    },
  },
  {
    sequelize: frontSequelize,
    modelName: "feature_flags",
    indexes: [
      {
        unique: true,
        fields: ["workspaceId", "name"],
      },
      {
        fields: ["workspaceId"],
      },
    ],
  }
);
