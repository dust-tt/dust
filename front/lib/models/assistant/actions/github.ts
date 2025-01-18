import type { GithubBaseActionType } from "@dust-tt/types";
import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { BaseModel } from "@app/lib/resources/storage/wrappers";

// Shared Github actions configuration. Github actions do not have any parameter for now (we might
// want to allow pinnig the repo in the future). Their configuration is shared and used to track
// which specific action is enabled for an assistant.
export class AgentGithubConfiguration extends BaseModel<AgentGithubConfiguration> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfigurationId: ForeignKey<AgentConfiguration["id"]>;

  declare sId: string;

  declare actionType: GithubBaseActionType;

  declare name: string | null;
  declare description: string | null;
}

AgentGithubConfiguration.init(
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
    actionType: {
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
    modelName: "agent_github_configuration",
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

AgentConfiguration.hasMany(AgentGithubConfiguration, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
});
AgentGithubConfiguration.belongsTo(AgentConfiguration, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
});

/**
 * GithubGetPullRequest Action
 */

export class AgentGithubGetPullRequestAction extends BaseModel<AgentGithubGetPullRequestAction> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare owner: string;
  declare repo: string;
  declare pullNumber: number;

  declare pullBody: string | null;
  declare pullCommits: Array<{
    oid: string;
    message: string;
    author: string;
  }> | null;
  declare pullDiff: string | null;

  declare functionCallId: string | null;
  declare functionCallName: string | null;

  declare step: number;
  declare agentMessageId: ForeignKey<AgentMessage["id"]>;
}
AgentGithubGetPullRequestAction.init(
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
    owner: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    repo: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    pullNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    pullBody: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    pullCommits: {
      type: DataTypes.ARRAY(DataTypes.JSONB),
      allowNull: true,
    },
    pullDiff: {
      type: DataTypes.TEXT,
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
    modelName: "agent_github_get_pull_request_action",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["agentMessageId"],
        concurrently: true,
      },
    ],
  }
);

AgentGithubGetPullRequestAction.belongsTo(AgentMessage, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});

AgentMessage.hasMany(AgentGithubGetPullRequestAction, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});
