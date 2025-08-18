import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import type { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { frontSequelize } from "@app/lib/resources/storage";
import type { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type {
  TriggerConfigType,
  TriggerKind,
} from "@app/types/assistant/triggers";
import { TRIGGER_KINDS } from "@app/types/assistant/triggers";

export class TriggerModel extends WorkspaceAwareModel<TriggerModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;
  declare name: string;
  declare description: string;
  declare kind: TriggerKind;
  declare customPrompt: string | null;

  declare agentConfigurationId: ForeignKey<AgentConfiguration["id"]>;

  declare editor: ForeignKey<UserModel["id"]>;
  declare subscribers: ForeignKey<UserModel["id"]>[];

  declare configuration: TriggerConfigType;
}

TriggerModel.init(
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
      allowNull: false,
    },
    kind: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [TRIGGER_KINDS],
      },
    },
    customPrompt: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    configuration: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
  },
  {
    modelName: "trigger",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["workspaceId"] },
      { fields: ["workspaceId", "agentConfigurationId"] },
    ],
  }
);
