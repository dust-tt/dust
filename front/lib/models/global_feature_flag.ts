import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { BaseModel } from "@app/lib/resources/storage/wrappers/base";
import type { CreationOptional } from "sequelize";

export class GlobalFeatureFlagModel extends BaseModel<GlobalFeatureFlagModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: string;
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
