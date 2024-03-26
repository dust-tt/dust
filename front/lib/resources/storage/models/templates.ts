import type {
  ActionPreset,
  AssistantCreativityLevel,
  AssistantTemplateTagNameType,
  TemplateVisibility,
} from "@dust-tt/types";
import type {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";

export class TemplateModel extends Model<
  InferAttributes<TemplateModel>,
  InferCreationAttributes<TemplateModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;
  declare name: string;
  declare description: string | null;

  declare visibility: TemplateVisibility;

  declare presetHandle: string | null;
  declare presetDescription: string | null;
  declare presetInstructions: string | null;
  declare presetTemperature: AssistantCreativityLevel | null;
  declare presetProviderId: string | null;
  declare presetModelId: string | null;
  declare presetAction: ActionPreset | null;

  declare helpInstructions: string | null;
  declare helpActions: string | null;

  declare tags: AssistantTemplateTagNameType[];
}

TemplateModel.init(
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
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
    },
    visibility: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    presetHandle: {
      type: DataTypes.STRING,
    },
    presetDescription: {
      type: DataTypes.STRING,
    },
    presetInstructions: {
      type: DataTypes.STRING,
    },
    presetTemperature: {
      type: DataTypes.STRING,
    },
    presetProviderId: {
      type: DataTypes.STRING,
    },
    presetModelId: {
      type: DataTypes.STRING,
    },
    presetAction: {
      type: DataTypes.STRING,
    },
    helpInstructions: {
      type: DataTypes.STRING,
    },
    helpActions: {
      type: DataTypes.STRING,
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
    },
  },
  {
    sequelize: frontSequelize,
    modelName: "template",
    indexes: [
      { unique: true, fields: ["sId"] },
      {
        fields: ["visibility"],
      },
    ],
  }
);
