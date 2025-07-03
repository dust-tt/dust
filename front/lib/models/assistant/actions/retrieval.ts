import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { TimeframeUnit } from "@app/types";

export class AgentRetrievalConfiguration extends WorkspaceAwareModel<AgentRetrievalConfiguration> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfigurationId: ForeignKey<AgentConfiguration["id"]>;

  declare sId: string;

  declare query: "auto" | "none";
  declare relativeTimeFrame: "auto" | "none" | "custom";
  declare relativeTimeFrameDuration: number | null;
  declare relativeTimeFrameUnit: TimeframeUnit | null;
  declare topK: number | null;
  declare topKMode: "auto" | "custom";

  declare name: string | null;
  declare description: string | null;
}

// TODO(DURABLE_AGENT 2025-06-30): Remove once process has been migrated.
AgentRetrievalConfiguration.init(
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
    query: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "auto",
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
    topK: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    topKMode: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "auto",
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
    modelName: "agent_retrieval_configuration",
    sequelize: frontSequelize,
    indexes: [
      // TODO(WORKSPACE_ID_ISOLATION 2025-05-13): Remove this index.
      {
        fields: ["agentConfigurationId"],
        concurrently: true,
      },
      {
        fields: ["workspaceId", "agentConfigurationId"],
        concurrently: true,
        name: "agent_retrieval_config_workspace_id_agent_config_id",
      },
      {
        unique: true,
        fields: ["sId"],
        concurrently: true,
      },
    ],
    hooks: {
      beforeValidate: (retrieval: AgentRetrievalConfiguration) => {
        // Validation for Timeframe
        if (retrieval.relativeTimeFrame === "custom") {
          if (
            !retrieval.relativeTimeFrameDuration ||
            !retrieval.relativeTimeFrameUnit
          ) {
            throw new Error(
              "Custom relative time frame must have a duration and unit set"
            );
          }
        }

        // Validation for TopK
        if (retrieval.topKMode == "custom") {
          if (!retrieval.topK) {
            throw new Error("topK must be set when topKMode is 'custom'");
          }
        } else if (retrieval.topK) {
          throw new Error("topK must be null when topKMode is not 'custom'");
        }
      },
    },
  }
);

AgentConfiguration.hasMany(AgentRetrievalConfiguration, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
});
AgentRetrievalConfiguration.belongsTo(AgentConfiguration, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
});
