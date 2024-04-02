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

export class SolutionDataSourceConfiguration extends Model<
  InferAttributes<SolutionDataSourceConfiguration>,
  InferCreationAttributes<SolutionDataSourceConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare userId: ForeignKey<User["id"]>;
  declare solutionId: SolutionIdType;
  declare connectionId: string | null;
  declare provider: SolutionProviderType;
}

SolutionDataSourceConfiguration.init(
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
    modelName: "solution_data_source_configuration",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["user_id"] },
      { fields: ["provider", "connectionId"], unique: true },
    ],
  }
);