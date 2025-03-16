import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import type { WebsearchActionOutputType } from "@app/lib/actions/websearch";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class AgentWebsearchConfiguration extends WorkspaceAwareModel<AgentWebsearchConfiguration> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfigurationId: ForeignKey<AgentConfiguration["id"]>;

  declare sId: string;

  declare name: string | null;
  declare description: string | null;
}

AgentWebsearchConfiguration.init(
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
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    modelName: "agent_websearch_configuration",
    indexes: [
      {
        unique: true,
        fields: ["sId"],
      },
      {
        fields: ["agentConfigurationId"],
        concurrently: true,
      },
    ],
    sequelize: frontSequelize,
  }
);

AgentConfiguration.hasMany(AgentWebsearchConfiguration, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
});
AgentWebsearchConfiguration.belongsTo(AgentConfiguration, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
});

export class AgentWebsearchAction extends WorkspaceAwareModel<AgentWebsearchAction> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare runId: string | null;

  declare websearchConfigurationId: string;

  declare query: string;

  declare output: WebsearchActionOutputType | null;
  declare functionCallId: string | null;
  declare functionCallName: string | null;

  declare step: number;
  declare agentMessageId: ForeignKey<AgentMessage["id"]>;
}
AgentWebsearchAction.init(
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

    websearchConfigurationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    query: {
      type: DataTypes.TEXT,
      allowNull: false,
    },

    output: {
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
  },
  {
    modelName: "agent_websearch_action",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["agentMessageId"],
        concurrently: true,
      },
    ],
  }
);

AgentWebsearchAction.belongsTo(AgentMessage, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});

AgentMessage.hasMany(AgentWebsearchAction, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});
