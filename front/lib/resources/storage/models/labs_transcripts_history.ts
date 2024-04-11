import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";

import type { LabsTranscriptsConfigurationModel } from "./labs_transcripts_configuration";

export class LabsTranscriptsHistoryModel extends Model<
  InferAttributes<LabsTranscriptsHistoryModel>,
  InferCreationAttributes<LabsTranscriptsHistoryModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare configurationId: ForeignKey<LabsTranscriptsConfigurationModel["id"]>;
  declare fileId: string;
  declare fileName: string;
}

LabsTranscriptsHistoryModel.init(
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
    configurationId: {
      type: DataTypes.INTEGER,
      references: {
        model: "labs_transcripts_configurations",
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
    modelName: "labs_transcripts_history",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["configurationId"] },
      { fields: ["fileId"], unique: true },
    ],
  }
);
