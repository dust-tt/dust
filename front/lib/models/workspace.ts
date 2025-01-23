import type {
  EmbeddingProviderIdType,
  WorkspaceSegmentationType,
} from "@dust-tt/types";
import { MODEL_PROVIDER_IDS } from "@dust-tt/types";
import type { CreationOptional, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import type { Subscription } from "@app/lib/models/plan";
import { frontSequelize } from "@app/lib/resources/storage";
import { BaseModel } from "@app/lib/resources/storage/wrappers/base";

const modelProviders = [...MODEL_PROVIDER_IDS] as string[];
export type ModelProviderIdType = (typeof MODEL_PROVIDER_IDS)[number];

export class Workspace extends BaseModel<Workspace> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;
  declare name: string;
  declare description: string | null;
  declare segmentation: WorkspaceSegmentationType;
  declare ssoEnforced?: boolean;
  declare subscriptions: NonAttribute<Subscription[]>;
  declare whiteListedProviders: ModelProviderIdType[] | null;
  declare defaultEmbeddingProvider: EmbeddingProviderIdType | null;
  declare conversationsRetentionDays: number | null;
}
Workspace.init(
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
    segmentation: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    ssoEnforced: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    conversationsRetentionDays: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    whiteListedProviders: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: null,
      allowNull: true,
      validate: {
        isProviderValid(value: string[] | null) {
          if (value && !value.every((val) => modelProviders.includes(val))) {
            throw new Error("Invalid provider in whiteListedProviders");
          }
        },
      },
    },
    defaultEmbeddingProvider: {
      type: DataTypes.STRING,
      defaultValue: null,
      allowNull: true,
      validate: {
        isIn: [modelProviders],
      },
    },
  },
  {
    modelName: "workspace",
    sequelize: frontSequelize,
    indexes: [{ unique: true, fields: ["sId"] }],
  }
);
