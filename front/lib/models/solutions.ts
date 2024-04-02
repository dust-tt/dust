import type { SolutionIdType, SolutionProviderType } from "@dust-tt/types";
import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import type { User } from "@app/lib/models/user";
import { frontSequelize } from "@app/lib/resources/storage";

export class SolutionsDataSourceConfiguration extends Model<
  InferAttributes<SolutionsDataSourceConfiguration>,
  InferCreationAttributes<SolutionsDataSourceConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare userId: ForeignKey<User["id"]>;
  declare solutionId: SolutionIdType;
  declare connectionId: string | null;
  declare provider: SolutionProviderType;
}

SolutionsDataSourceConfiguration.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
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
      type: DataTypes.INTEGER,
      references: {
        model: "users",
        key: "id",
      },
    },
    solutionId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    connectionId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    provider: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "solutions_data_source_configuration",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["userId"] },
      { fields: ["solutionId", "provider", "connectionId"], unique: true },
    ],
  }
);