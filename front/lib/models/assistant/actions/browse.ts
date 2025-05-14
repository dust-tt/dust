import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import type { BrowseActionOutputType } from "@app/lib/actions/browse";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class AgentBrowseConfiguration extends WorkspaceAwareModel<AgentBrowseConfiguration> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfigurationId: ForeignKey<AgentConfiguration["id"]>;

  declare sId: string;

  declare name: string | null;
  declare description: string | null;
}

AgentBrowseConfiguration.init(
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
    modelName: "agent_browse_configuration",
    indexes: [
      {
        unique: true,
        fields: ["sId"],
      },
      // TODO(WORKSPACE_ID_ISOLATION 2025-05-13): Remove this index.
      {
        fields: ["agentConfigurationId"],
        concurrently: true,
      },
      {
        fields: ["workspaceId", "agentConfigurationId"],
        concurrently: true,
        name: "agent_browse_config_workspace_id_agent_config_id",
      },
    ],
    sequelize: frontSequelize,
  }
);

AgentConfiguration.hasMany(AgentBrowseConfiguration, {
  foreignKey: {
    name: "agentConfigurationId",
    allowNull: false,
  },
  as: "browseConfigurations",
});
AgentBrowseConfiguration.belongsTo(AgentConfiguration, {
  foreignKey: {
    name: "agentConfigurationId",
    allowNull: false,
  },
});

export class AgentBrowseAction extends WorkspaceAwareModel<AgentBrowseAction> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare runId: string | null;

  declare browseConfigurationId: string;

  declare urls: string[];

  declare output: BrowseActionOutputType | null;
  declare functionCallId: string | null;
  declare functionCallName: string | null;

  declare step: number;
  declare agentMessageId: ForeignKey<AgentMessage["id"]>;
}
AgentBrowseAction.init(
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
    browseConfigurationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    urls: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
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
    modelName: "agent_browse_action",
    sequelize: frontSequelize,
    indexes: [
      // TODO(WORKSPACE_ID_ISOLATION 2025-05-12): Remove this index
      {
        fields: ["agentMessageId"],
        concurrently: true,
      },
      {
        fields: ["workspaceId", "agentMessageId"],
      },
    ],
  }
);

AgentBrowseAction.belongsTo(AgentMessage, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});

AgentMessage.hasMany(AgentBrowseAction, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});
