import type {
  GithubBaseActionType,
  GithubGetPullRequestCommentType,
  GithubGetPullRequestCommitType,
  GithubGetPullRequestReviewType,
} from "@dust-tt/types";
import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

// Shared Github actions configuration. Github actions do not have any parameter for now (we might
// want to allow pinnig the repo in the future). Their configuration is shared and used to track
// which specific action is enabled for an agent.
export class AgentGithubConfiguration extends WorkspaceAwareModel<AgentGithubConfiguration> {
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

export class AgentGithubGetPullRequestAction extends WorkspaceAwareModel<AgentGithubGetPullRequestAction> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare owner: string;
  declare repo: string;
  declare pullNumber: number;

  declare pullBody: string | null;
  declare pullCommits: Array<GithubGetPullRequestCommitType> | null;
  declare pullComments: Array<GithubGetPullRequestCommentType> | null;
  declare pullReviews: Array<GithubGetPullRequestReviewType> | null;
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
    pullComments: {
      type: DataTypes.ARRAY(DataTypes.JSONB),
      allowNull: true,
    },
    pullReviews: {
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

/**
 * GithubCreateIssue Action
 */

export class AgentGithubCreateIssueAction extends WorkspaceAwareModel<AgentGithubCreateIssueAction> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare owner: string;
  declare repo: string;
  declare title: string;
  declare body: string;

  declare issueNumber: number | null;

  declare functionCallId: string | null;
  declare functionCallName: string | null;

  declare step: number;
  declare agentMessageId: ForeignKey<AgentMessage["id"]>;
}
AgentGithubCreateIssueAction.init(
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
    title: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    issueNumber: {
      type: DataTypes.INTEGER,
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
    modelName: "agent_github_create_issue_action",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["agentMessageId"],
        concurrently: true,
      },
    ],
  }
);

AgentGithubCreateIssueAction.belongsTo(AgentMessage, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});

AgentMessage.hasMany(AgentGithubCreateIssueAction, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});
