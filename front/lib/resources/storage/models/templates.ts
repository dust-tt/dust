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
  declare description: string | null;

  declare visibility: TemplateVisibility;

  declare backgroundColor: string;
  declare emoji: string;
  declare handle: string;

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
    description: {
      type: DataTypes.TEXT,
    },
    backgroundColor: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    emoji: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    visibility: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    handle: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    presetDescription: {
      type: DataTypes.TEXT,
    },
    presetInstructions: {
      type: DataTypes.TEXT,
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
      type: DataTypes.TEXT,
    },
    helpActions: {
      type: DataTypes.TEXT,
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
