import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import type { TemplateActionType } from "@app/components/assistant_builder/types";
import { frontSequelize } from "@app/lib/resources/storage";
import { BaseModel } from "@app/lib/resources/storage/wrappers/base";
import type {
  AssistantCreativityLevel,
  ModelIdType,
  ModelProviderIdType,
  TemplateTagCodeType,
  TemplateVisibility,
  TimeframeUnit,
} from "@app/types";

export class TemplateModel extends BaseModel<TemplateModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare description: string | null;

  declare visibility: TemplateVisibility;

  declare backgroundColor: string;
  declare emoji: string;
  declare handle: string;

  declare presetDescription: string | null;
  declare presetInstructions: string | null;
  declare presetTemperature: AssistantCreativityLevel;
  declare presetProviderId: ModelProviderIdType;
  declare presetModelId: ModelIdType;
  declare presetActions: TemplateActionType[];

  declare timeFrameDuration: number | null;
  declare timeFrameUnit: TimeframeUnit | null;

  declare helpInstructions: string | null;
  declare helpActions: string | null;

  declare tags: TemplateTagCodeType[];
}

TemplateModel.init(
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
      allowNull: false,
    },
    presetProviderId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    presetModelId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    presetActions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    timeFrameDuration: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    timeFrameUnit: {
      type: DataTypes.STRING,
      allowNull: true,
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
      {
        fields: ["visibility"],
      },
    ],
  }
);
