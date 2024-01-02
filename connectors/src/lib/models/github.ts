import {
  type CreationOptional,
  DataTypes,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
} from "sequelize";

import { Connector, sequelize_conn } from "@connectors/lib/models";

export class GithubConnectorState extends Model<
  InferAttributes<GithubConnectorState>,
  InferCreationAttributes<GithubConnectorState>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare webhooksEnabledAt?: Date | null;

  declare connectorId: ForeignKey<Connector["id"]>;
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
    webhooksEnabledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize: sequelize_conn,
    modelName: "github_connector_states",
    indexes: [{ fields: ["connectorId"], unique: true }],
  }
);
Connector.hasOne(GithubConnectorState);

export class GithubIssue extends Model<
  InferAttributes<GithubIssue>,
  InferCreationAttributes<GithubIssue>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare repoId: string;
  declare issueNumber: number;

  declare connectorId: ForeignKey<Connector["id"]>;
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
    sequelize: sequelize_conn,
    indexes: [
      { fields: ["repoId", "issueNumber", "connectorId"], unique: true },
      { fields: ["connectorId"] },
      { fields: ["repoId", "updatedAt"] },
    ],
    modelName: "github_issues",
  }
);
Connector.hasMany(GithubIssue);

export class GithubDiscussion extends Model<
  InferAttributes<GithubDiscussion>,
  InferCreationAttributes<GithubDiscussion>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare repoId: string;
  declare discussionNumber: number;

  declare connectorId: ForeignKey<Connector["id"]>;
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
    sequelize: sequelize_conn,
    indexes: [
      { fields: ["repoId", "discussionNumber", "connectorId"], unique: true },
      { fields: ["connectorId"] },
      { fields: ["repoId", "updatedAt"] },
    ],
    modelName: "github_discussions",
  }
);
Connector.hasMany(GithubDiscussion);
