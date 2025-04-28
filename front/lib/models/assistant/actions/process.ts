import type { JSONSchema7 as JSONSchema } from "json-schema";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import type { ProcessActionOutputsType } from "@app/lib/actions/process";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { TimeframeUnit } from "@app/types";

export class AgentProcessConfiguration extends WorkspaceAwareModel<AgentProcessConfiguration> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfigurationId: ForeignKey<AgentConfiguration["id"]>;

  declare sId: string;

  declare relativeTimeFrame: "auto" | "none" | "custom";
  declare relativeTimeFrameDuration: number | null;
  declare relativeTimeFrameUnit: TimeframeUnit | null;

  declare jsonSchema: JSONSchema | null;

  declare name: string | null;
  declare description: string | null;
}

AgentProcessConfiguration.init(
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
    relativeTimeFrame: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "auto",
    },
    relativeTimeFrameDuration: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    relativeTimeFrameUnit: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    jsonSchema: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    modelName: "agent_process_configuration",
    indexes: [
      {
        unique: true,
        fields: ["sId"],
        concurrently: true,
      },
      {
        fields: ["agentConfigurationId"],
        concurrently: true,
      },
    ],
    sequelize: frontSequelize,
    hooks: {
      beforeValidate: (p: AgentProcessConfiguration) => {
        // Validation for Timeframe
        if (p.relativeTimeFrame === "custom") {
          if (!p.relativeTimeFrameDuration || !p.relativeTimeFrameUnit) {
            throw new Error(
              "Custom relative time frame must have a duration and unit set"
            );
          }
        }
      },
    },
  }
);

AgentConfiguration.hasMany(AgentProcessConfiguration, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
});
AgentProcessConfiguration.belongsTo(AgentConfiguration, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
});

/**
 * Process Action
 */
export class AgentProcessAction extends WorkspaceAwareModel<AgentProcessAction> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare runId: string | null;

  declare processConfigurationId: string;

  declare relativeTimeFrameDuration: number | null;
  declare relativeTimeFrameUnit: TimeframeUnit | null;

  declare tagsIn: string[] | null;
  declare tagsNot: string[] | null;

  declare jsonSchema: JSONSchema | null;
  declare outputs: ProcessActionOutputsType | null;
  declare functionCallId: string | null;
  declare functionCallName: string | null;

  declare step: number;

  declare agentMessageId: ForeignKey<AgentMessage["id"]>;

  declare jsonFileId: ForeignKey<FileModel["id"]> | null;
  declare jsonFileSnippet: string | null;
  declare jsonFile: NonAttribute<FileModel>;
}
AgentProcessAction.init(
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
    runId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    processConfigurationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    relativeTimeFrameDuration: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    relativeTimeFrameUnit: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    tagsIn: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    tagsNot: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    jsonSchema: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    outputs: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    functionCallId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    functionCallName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    step: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    jsonFileSnippet: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    modelName: "agent_process_action",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["agentMessageId"],
        concurrently: true,
      },
      {
        fields: ["jsonFileId"],
        concurrently: true,
      },
    ],
    hooks: {
      beforeValidate: (p: AgentProcessAction) => {
        // Validation for Timeframe
        if (
          (p.relativeTimeFrameDuration === null) !==
          (p.relativeTimeFrameUnit === null)
        ) {
          throw new Error(
            "Relative time frame must have a duration and unit set or they should both be null"
          );
        }
      },
    },
  }
);

AgentProcessAction.belongsTo(AgentMessage, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});
AgentMessage.hasMany(AgentProcessAction, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});

FileModel.hasMany(AgentProcessAction, {
  foreignKey: { name: "jsonFileId", allowNull: true },
  onDelete: "SET NULL",
});
AgentProcessAction.belongsTo(FileModel, {
  as: "jsonFile",
  foreignKey: { name: "jsonFileId", allowNull: true },
  onDelete: "SET NULL",
});
