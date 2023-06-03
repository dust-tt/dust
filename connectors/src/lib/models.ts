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
  declare firstSuccessfulSyncTime?: Date;
  declare firstSyncProgress?: string;
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
    firstSuccessfulSyncTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    firstSyncProgress: {
      type: DataTypes.STRING,
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

export class SlackMessages extends Model<
  InferAttributes<SlackMessages>,
  InferCreationAttributes<SlackMessages>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare connectorId: ForeignKey<Connector["id"]>;
  declare channelId: string;
  declare messageTs?: string;
  declare documentId: string;
}

SlackMessages.init(
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
    connectorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    channelId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    messageTs: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    documentId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelize_conn,
    modelName: "slack_messages",
    indexes: [
      { fields: ["connectorId", "channelId", "messageTs"], unique: true },
    ],
  }
);

Connector.hasOne(SlackMessages);

export class NotionConnectorState extends Model<
  InferAttributes<NotionConnectorState>,
  InferCreationAttributes<NotionConnectorState>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare lastGarbageCollectionFinishTime?: Date;

  declare connectorId: ForeignKey<Connector["id"]>;
}

NotionConnectorState.init(
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
    lastGarbageCollectionFinishTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize: sequelize_conn,
    modelName: "notion_connector_states",
    indexes: [{ fields: ["connectorId"], unique: true }],
  }
);

Connector.hasOne(NotionConnectorState);

export class NotionPage extends Model<
  InferAttributes<NotionPage>,
  InferCreationAttributes<NotionPage>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare notionPageId: string;
  declare lastSeenTs: Date;
  declare lastUpsertedTs?: Date;

  declare skipReason?: string | null;

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
    lastSeenTs: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    lastUpsertedTs: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    skipReason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize: sequelize_conn,
    indexes: [
      { fields: ["notionPageId", "connectorId"], unique: true },
      { fields: ["connectorId"] },
      { fields: ["lastSeenTs"] },
    ],
    modelName: "notion_pages",
  }
);
Connector.hasMany(NotionPage);

export class GoogleDriveFolders extends Model<
  InferAttributes<GoogleDriveFolders>,
  InferCreationAttributes<GoogleDriveFolders>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare connectorId: ForeignKey<Connector["id"]>;
  declare folderId: string;
}

GoogleDriveFolders.init(
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
    connectorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    folderId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelize_conn,
    modelName: "google_drive_folders",
    indexes: [{ fields: ["connectorId", "folderId"], unique: true }],
  }
);

Connector.hasMany(GoogleDriveFolders);

export class GoogleDriveFiles extends Model<
  InferAttributes<GoogleDriveFiles>,
  InferCreationAttributes<GoogleDriveFiles>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare connectorId: ForeignKey<Connector["id"]>;
  declare fileId: string;
}

GoogleDriveFiles.init(
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
    connectorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    fileId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelize_conn,
    modelName: "google_drive_files",
    indexes: [{ fields: ["connectorId", "fileId"], unique: true }],
  }
);
Connector.hasMany(GoogleDriveFiles);

export class GoogleDriveSyncToken extends Model<
  InferAttributes<GoogleDriveSyncToken>,
  InferCreationAttributes<GoogleDriveSyncToken>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare driveId: string;
  declare syncToken: string;
  declare connectorId: ForeignKey<Connector["id"]>;
}

GoogleDriveSyncToken.init(
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
    connectorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    driveId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    syncToken: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelize_conn,
    modelName: "google_drive_sync_tokens",
    indexes: [{ fields: ["connectorId", "driveId"], unique: true }],
  }
);
Connector.hasMany(GoogleDriveSyncToken);
