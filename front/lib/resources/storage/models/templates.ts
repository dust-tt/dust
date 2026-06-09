import { frontSequelize } from "@app/lib/resources/storage";
import { BaseModel } from "@app/lib/resources/storage/wrappers/base";
import type { AssistantCreativityLevel } from "@app/types/assistant/builder";
import type {
  ModelIdType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";
import type {
  TemplateActionPreset,
  TemplateTagCodeType,
  TemplateVisibility,
} from "@app/types/assistant/templates";
import type { TimeframeUnit } from "@app/types/shared/utils/time_frame";
import type { CreationOptional } from "sequelize";
import { DataTypes, DANGEROUSLY_UNBOUNDED_TEXT } from "@app/lib/resources/storage/data_types";

export class TemplateModel extends BaseModel<TemplateModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare userFacingDescription: string | null;
  declare agentFacingDescription: string | null;

  declare visibility: TemplateVisibility;

  declare backgroundColor: string;
  declare emoji: string;
  declare handle: string;

  declare presetDescription: string | null;
  declare presetInstructions: string | null;
  declare presetTemperature: AssistantCreativityLevel;
  declare presetProviderId: ModelProviderIdType;
  declare presetModelId: ModelIdType;
  declare presetActions: TemplateActionPreset[];

  declare timeFrameDuration: number | null;
  declare timeFrameUnit: TimeframeUnit | null;

  declare helpInstructions: string | null;
  declare helpActions: string | null;
  declare sidekickInstructions: string | null;

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
    userFacingDescription: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
    },
    agentFacingDescription: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
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
      type: DANGEROUSLY_UNBOUNDED_TEXT,
    },
    presetInstructions: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
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
      type: DANGEROUSLY_UNBOUNDED_TEXT,
    },
    helpActions: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
    },
    sidekickInstructions: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
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
