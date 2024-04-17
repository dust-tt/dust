import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";

import { LabsTranscriptsConfigurationModel } from "./labs_transcripts_configuration";

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
  declare configuration: NonAttribute<LabsTranscriptsConfigurationModel>;
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

LabsTranscriptsHistoryModel.belongsTo(LabsTranscriptsConfigurationModel, {
  as: "configuration",
  foreignKey: {
    name: "configurationId", allowNull: false
  },
});

LabsTranscriptsConfigurationModel.hasMany(LabsTranscriptsHistoryModel, {
  as: "configuration",
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});