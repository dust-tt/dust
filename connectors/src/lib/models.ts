import {
  type CreationOptional,
  DataTypes,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

import {
  type ConnectorProvider,
  ConnectorSyncStatus,
} from "@connectors/types/connector";

const { CONNECTORS_DATABASE_URI } = process.env;
if (!CONNECTORS_DATABASE_URI) {
  throw new Error("CONNECTORS_DATABASE_URI is not defined");
}

export const sequelize_conn = new Sequelize(CONNECTORS_DATABASE_URI as string, {
  logging: false,
});

export type ModelId = number;

export class Connector extends Model<
  InferAttributes<Connector>,
  InferCreationAttributes<Connector>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare type: ConnectorProvider;
  declare nangoConnectionId: string;
  declare workspaceAPIKey: string;
  declare workspaceId: string;
  declare dataSourceName: string;

  declare lastSyncStatus?: ConnectorSyncStatus;
  declare lastSyncStartTime?: Date;
  declare lastSyncFinishTime?: Date;
  declare lastSyncSuccessfulTime?: Date;
}

Connector.init(
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
    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    nangoConnectionId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    workspaceAPIKey: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    workspaceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dataSourceName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastSyncStatus: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    lastSyncStartTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastSyncFinishTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastSyncSuccessfulTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize: sequelize_conn,

    modelName: "connectors",
    indexes: [{ fields: ["workspaceId", "dataSourceName"], unique: true }],
  }
);

export class SlackConfiguration extends Model<
  InferAttributes<SlackConfiguration>,
  InferCreationAttributes<SlackConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare slackTeamId: string;
  declare connectorId: ForeignKey<Connector["id"]>;
}

SlackConfiguration.init(
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
    slackTeamId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelize_conn,
    indexes: [
      { fields: ["slackTeamId"] },
      { fields: ["connectorId"], unique: true },
    ],
    modelName: "slack_configurations",
  }
);
Connector.hasOne(SlackConfiguration);

export class NotionPage extends Model<
  InferAttributes<NotionPage>,
  InferCreationAttributes<NotionPage>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare notionPageId: string;
  declare dustDatasourceDocumentId: string;
  declare lastSeenTs: number;

  declare connectorId: ForeignKey<Connector["id"]>;
}

NotionPage.init(
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
    notionPageId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dustDatasourceDocumentId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastSeenTs: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    connectorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    sequelize: sequelize_conn,
    indexes: [
      { fields: ["notionPageId"], unique: true },
      { fields: ["dustDatasourceDocumentId", "connectorId"], unique: true },
      { fields: ["connectorId"] },
      { fields: ["lastSeenTs"] },
    ],
    modelName: "notion_pages",
  }
);
Connector.hasMany(NotionPage);
