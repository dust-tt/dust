import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";

import type { SolutionsTranscriptsConfigurationModel } from "./solutions_transcripts_configuration";

export class SolutionsTranscriptsHistoryModel extends Model<
  InferAttributes<SolutionsTranscriptsHistoryModel>,
  InferCreationAttributes<SolutionsTranscriptsHistoryModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare solutionsTranscriptsConfigurationId: ForeignKey<
    SolutionsTranscriptsConfigurationModel["id"]
  >;
  declare fileId: string;
  declare fileName: string;
}

SolutionsTranscriptsHistoryModel.init(
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
    solutionsTranscriptsConfigurationId: {
      type: DataTypes.INTEGER,
      references: {
        model: "solutions_transcripts_configurations",
        key: "id",
      },
    },
    fileId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    fileName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "solutions_transcripts_history",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["solutionsTranscriptsConfigurationId"] },
      { fields: ["fileId"], unique: true },
    ],
  }
);
