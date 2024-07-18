import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

export class GithubConnectorState extends Model<
  InferAttributes<GithubConnectorState>,
  InferCreationAttributes<GithubConnectorState>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare installationId: string | null;
  declare webhooksEnabledAt?: Date | null;
  declare codeSyncEnabled: boolean;

  declare connectorId: ForeignKey<ConnectorModel["id"]>;
}
GithubConnectorState.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
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
    sequelize: sequelizeConnection,
    modelName: "github_connector_states",
    indexes: [
      { fields: ["connectorId"], unique: true },
      { fields: ["installationId"] },
    ],
  }
);
ConnectorModel.hasOne(GithubConnectorState);

export class GithubIssue extends Model<
  InferAttributes<GithubIssue>,
  InferCreationAttributes<GithubIssue>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare repoId: string;
  declare issueNumber: number;

  declare connectorId: ForeignKey<ConnectorModel["id"]>;
}
GithubIssue.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
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
    issueNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    sequelize: sequelizeConnection,
    indexes: [
      { fields: ["repoId", "issueNumber", "connectorId"], unique: true },
      { fields: ["connectorId"] },
      { fields: ["repoId", "updatedAt"] },
    ],
    modelName: "github_issues",
  }
);
ConnectorModel.hasMany(GithubIssue);

export class GithubDiscussion extends Model<
  InferAttributes<GithubDiscussion>,
  InferCreationAttributes<GithubDiscussion>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare repoId: string;
  declare discussionNumber: number;

  declare connectorId: ForeignKey<ConnectorModel["id"]>;
}
GithubDiscussion.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
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
    sequelize: sequelizeConnection,
    indexes: [
      { fields: ["repoId", "discussionNumber", "connectorId"], unique: true },
      { fields: ["connectorId"] },
      { fields: ["repoId", "updatedAt"] },
    ],
    modelName: "github_discussions",
  }
);
ConnectorModel.hasMany(GithubDiscussion);

export class GithubCodeRepository extends Model<
  InferAttributes<GithubCodeRepository>,
  InferCreationAttributes<GithubCodeRepository>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare lastSeenAt: CreationOptional<Date>;
  declare codeUpdatedAt: CreationOptional<Date>;

  declare repoId: string;
  declare repoLogin: string;
  declare repoName: string;

  declare sourceUrl: string;

  declare connectorId: ForeignKey<ConnectorModel["id"]>;
}
GithubCodeRepository.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
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
    sequelize: sequelizeConnection,
    indexes: [{ fields: ["connectorId", "repoId"], unique: true }],
    modelName: "github_code_repositories",
  }
);
ConnectorModel.hasMany(GithubCodeRepository);

export class GithubCodeFile extends Model<
  InferAttributes<GithubCodeFile>,
  InferCreationAttributes<GithubCodeFile>
> {
  declare id: CreationOptional<number>;
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

  declare connectorId: ForeignKey<ConnectorModel["id"]>;
}
GithubCodeFile.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
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
  },
  {
    sequelize: sequelizeConnection,
    indexes: [
      { fields: ["connectorId", "repoId", "documentId"], unique: true },
      { fields: ["connectorId", "repoId", "lastSeenAt"] },
    ],
    modelName: "github_code_files",
  }
);
ConnectorModel.hasMany(GithubCodeFile);

export class GithubCodeDirectory extends Model<
  InferAttributes<GithubCodeDirectory>,
  InferCreationAttributes<GithubCodeDirectory>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare lastSeenAt: CreationOptional<Date>;
  declare codeUpdatedAt: CreationOptional<Date>;

  declare repoId: string;
  declare internalId: string;
  declare parentInternalId: string;

  declare dirName: string;
  declare sourceUrl: string;

  declare connectorId: ForeignKey<ConnectorModel["id"]>;
}
GithubCodeDirectory.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
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
    sequelize: sequelizeConnection,
    indexes: [
      { fields: ["connectorId", "repoId", "internalId"], unique: true },
      { fields: ["connectorId", "repoId", "lastSeenAt"] },
    ],
    modelName: "github_code_directories",
  }
);
ConnectorModel.hasMany(GithubCodeDirectory);
