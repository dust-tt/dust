import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import { connectorsSequelize } from "@connectors/resources/storage";
import { ConnectorBaseModel } from "@connectors/resources/storage/wrappers/model_with_connectors";

export class GithubConnectorStateModel extends ConnectorBaseModel<GithubConnectorStateModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare installationId: string | null;
  declare webhooksEnabledAt?: Date | null;
  declare codeSyncEnabled: boolean;
}
GithubConnectorStateModel.init(
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
    installationId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    webhooksEnabledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    codeSyncEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize: connectorsSequelize,
    modelName: "github_connector_states",
    indexes: [
      { fields: ["connectorId"], unique: true },
      { fields: ["installationId"] },
    ],
    relationship: "hasOne",
  }
);

export class GithubIssueModel extends ConnectorBaseModel<GithubIssueModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare skipReason: string | null;

  declare repoId: string;
  declare issueNumber: number;
}
GithubIssueModel.init(
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
    skipReason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    repoId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    issueNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    sequelize: connectorsSequelize,
    indexes: [
      { fields: ["repoId", "issueNumber", "connectorId"], unique: true },
      { fields: ["connectorId"] },
      { fields: ["repoId", "updatedAt"] },
    ],
    modelName: "github_issues",
  }
);

export class GithubDiscussionModel extends ConnectorBaseModel<GithubDiscussionModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare repoId: string;
  declare discussionNumber: number;
}
GithubDiscussionModel.init(
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
    repoId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    discussionNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    sequelize: connectorsSequelize,
    indexes: [
      { fields: ["repoId", "discussionNumber", "connectorId"], unique: true },
      { fields: ["connectorId"] },
      { fields: ["repoId", "updatedAt"] },
    ],
    modelName: "github_discussions",
  }
);

export class GithubCodeRepositoryModel extends ConnectorBaseModel<GithubCodeRepositoryModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare lastSeenAt: CreationOptional<Date>;
  declare codeUpdatedAt: CreationOptional<Date>;
  declare forceDailySync: boolean;

  declare skipReason: string | null;

  declare repoId: string;
  declare repoLogin: string;
  declare repoName: string;

  declare sourceUrl: string;
}
GithubCodeRepositoryModel.init(
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
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    codeUpdatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    forceDailySync: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    skipReason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    repoId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    repoLogin: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    repoName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sourceUrl: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    sequelize: connectorsSequelize,
    indexes: [{ fields: ["connectorId", "repoId"], unique: true }],
    modelName: "github_code_repositories",
  }
);

export class GithubCodeFileModel extends ConnectorBaseModel<GithubCodeFileModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare lastSeenAt: CreationOptional<Date>;
  declare codeUpdatedAt: CreationOptional<Date>;

  declare repoId: string;
  declare documentId: string;
  declare parentInternalId: string;

  declare fileName: string;
  declare sourceUrl: string;
  declare contentHash: string;

  declare skipReason: string | null;
}
GithubCodeFileModel.init(
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
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    codeUpdatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    repoId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    documentId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    parentInternalId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    fileName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sourceUrl: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    contentHash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    skipReason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize: connectorsSequelize,
    indexes: [
      { fields: ["connectorId", "repoId", "documentId"], unique: true },
      { fields: ["connectorId", "repoId", "lastSeenAt"] },
    ],
    modelName: "github_code_files",
  }
);

export class GithubCodeDirectoryModel extends ConnectorBaseModel<GithubCodeDirectoryModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare lastSeenAt: CreationOptional<Date>;
  declare codeUpdatedAt: CreationOptional<Date>;

  declare repoId: string;
  declare internalId: string;
  declare parentInternalId: string;

  declare dirName: string;
  declare sourceUrl: string;
}
GithubCodeDirectoryModel.init(
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
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    codeUpdatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    repoId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    internalId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    parentInternalId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dirName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sourceUrl: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    sequelize: connectorsSequelize,
    indexes: [
      { fields: ["connectorId", "repoId", "internalId"], unique: true },
      { fields: ["connectorId", "repoId", "lastSeenAt"] },
    ],
    modelName: "github_code_directories",
  }
);
