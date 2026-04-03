import { frontSequelize } from "@app/lib/resources/storage";
import { BaseModel } from "@app/lib/resources/storage/wrappers/base";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

export class GlobalFeatureFlagModel extends BaseModel<GlobalFeatureFlagModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: WhitelistableFeature;
  declare rolloutPercentage: number;
}

GlobalFeatureFlagModel.init(
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
    rolloutPercentage: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
    },
  },
  {
    sequelize: frontSequelize,
    modelName: "global_feature_flags",
    indexes: [
      {
        unique: true,
        fields: ["name"],
      },
    ],
  }
);
