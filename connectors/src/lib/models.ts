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
import { ConnectorPermission } from "@connectors/types/resources";

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
  declare connectionId: string;

  declare workspaceAPIKey: string;
  declare workspaceId: string;
  declare dataSourceName: string;

  declare lastSyncStatus?: ConnectorSyncStatus;
  declare lastSyncStartTime?: Date;
  declare lastSyncFinishTime?: Date;
  declare lastSyncSuccessfulTime?: Date;
  declare firstSuccessfulSyncTime?: Date;
  declare firstSyncProgress?: string;
  declare lastGCTime: Date | null;

  declare defaultNewResourcePermission: ConnectorPermission;
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
    connectionId: {
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
    lastGCTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    defaultNewResourcePermission: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "read_write",
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
  declare botEnabled: boolean;
  declare connectorId: ForeignKey<Connector["id"]>;
  // declare defaultChannelPermission: ConnectorPermission;
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
    botEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize: sequelize_conn,
    indexes: [
      { fields: ["slackTeamId"] },
      { fields: ["connectorId"], unique: true },
      {
        fields: ["slackTeamId", "botEnabled"],
        where: { botEnabled: true },
        unique: true,
      },
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

export class SlackChannel extends Model<
  InferAttributes<SlackChannel>,
  InferCreationAttributes<SlackChannel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare connectorId: ForeignKey<Connector["id"]>;
  declare slackChannelId: string;
  declare slackChannelName: string;

  declare permission: ConnectorPermission;
}

SlackChannel.init(
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
    slackChannelId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    slackChannelName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    permission: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "read_write",
    },
  },
  {
    sequelize: sequelize_conn,
    modelName: "slack_channels",
    indexes: [
      { fields: ["connectorId", "slackChannelId"], unique: true },
      { fields: ["connectorId"] },
    ],
  }
);

Connector.hasMany(SlackChannel);

export class SlackChatBotMessage extends Model<
  InferAttributes<SlackChatBotMessage>,
  InferCreationAttributes<SlackChatBotMessage>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare connectorId: ForeignKey<Connector["id"]>;
  declare channelId: string;
  declare message: string;
  declare slackUserId: string;
  declare slackEmail: string;
  declare slackUserName: string;
  declare slackFullName: string;
  declare slackAvatar: string | null;
  declare slackTimezone: string | null;
  declare messageTs: string | null;
  declare chatSessionSid: string | null;
  declare completedAt: Date | null;
  declare conversationId: string | null; // conversationId is set only for V2 conversations
}

SlackChatBotMessage.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    createdAt: {
      type: DataTypes.DATE,
    },
    updatedAt: {
      type: DataTypes.DATE,
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
    chatSessionSid: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    slackUserId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    slackEmail: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    slackUserName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    slackTimezone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    conversationId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    slackFullName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    slackAvatar: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize: sequelize_conn,
    modelName: "slack_chat_bot_messages",
  }
);

Connector.hasOne(SlackChatBotMessage);

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
  declare lastCreatedOrMovedRunTs: CreationOptional<Date | null>;

  declare skipReason?: string | null;

  declare parentType?: string | null;
  declare parentId?: string | null;
  declare title?: string | null;
  declare titleSearchVector: unknown;
  declare notionUrl?: string | null;

  declare connectorId: ForeignKey<Connector["id"]> | null;
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
    lastCreatedOrMovedRunTs: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    skipReason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    parentType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    parentId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    title: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    titleSearchVector: {
      type: DataTypes.TSVECTOR,
      allowNull: true,
    },
    notionUrl: {
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
      { fields: ["parentId"] },
      { fields: ["lastCreatedOrMovedRunTs"] },
      {
        fields: ["titleSearchVector"],
        using: "gist",
        name: "notion_pages_title_search_vector_gist_idx",
      },
    ],
    modelName: "notion_pages",
  }
);
Connector.hasMany(NotionPage);

export class NotionDatabase extends Model<
  InferAttributes<NotionDatabase>,
  InferCreationAttributes<NotionDatabase>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare notionDatabaseId: string;
  declare lastSeenTs: Date;
  declare lastCreatedOrMovedRunTs: CreationOptional<Date | null>;

  declare skipReason?: string | null;

  declare parentType?: string | null;
  declare parentId?: string | null;
  declare title?: string | null;
  declare titleSearchVector: unknown;
  declare notionUrl?: string | null;

  declare connectorId: ForeignKey<Connector["id"]> | null;
}

NotionDatabase.init(
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
    notionDatabaseId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastSeenTs: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    lastCreatedOrMovedRunTs: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    skipReason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    parentType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    parentId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    title: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    titleSearchVector: {
      type: DataTypes.TSVECTOR,
      allowNull: true,
    },
    notionUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize: sequelize_conn,
    indexes: [
      { fields: ["notionDatabaseId", "connectorId"], unique: true },
      { fields: ["connectorId", "skipReason"] },
      { fields: ["lastSeenTs"] },
      { fields: ["lastCreatedOrMovedRunTs"] },
      { fields: ["parentId"] },
      {
        fields: ["titleSearchVector"],
        using: "gist",
        name: "notion_databases_title_search_vector_gist_idx",
      },
    ],
    modelName: "notion_databases",
  }
);

Connector.hasMany(NotionDatabase);

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
      { fields: ["repoId"] },
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
      { fields: ["repoId"] },
    ],
    modelName: "github_discussions",
  }
);
Connector.hasMany(GithubDiscussion);

// GoogleDriveFolders stores the folders selected by the user to sync.
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

Connector.hasOne(GoogleDriveFolders);

// GoogleDriveFiles stores files and folders synced from Google Drive.
export class GoogleDriveFiles extends Model<
  InferAttributes<GoogleDriveFiles>,
  InferCreationAttributes<GoogleDriveFiles>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare lastSeenTs: Date | null;
  declare connectorId: ForeignKey<Connector["id"]>;
  declare dustFileId: string;
  declare driveFileId: string;
  declare name: string;
  declare mimeType: string;
  declare parentId: string | null;
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
    lastSeenTs: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    connectorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    dustFileId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    driveFileId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "",
    },
    mimeType: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "",
    },
    parentId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize: sequelize_conn,
    modelName: "google_drive_files",
    indexes: [{ fields: ["connectorId", "driveFileId"], unique: true }],
  }
);
Connector.hasOne(GoogleDriveFiles);

// Sync Token are the equivalent of a timestamp for syncing the delta
// between the last sync and the current sync.
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
Connector.hasOne(GoogleDriveSyncToken);

export class GoogleDriveWebhook extends Model<
  InferAttributes<GoogleDriveWebhook>,
  InferCreationAttributes<GoogleDriveWebhook>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare webhookId: string;
  declare renewedByWebhookId: string | null;
  declare expiresAt: Date;
  declare renewAt: Date | null;
  declare connectorId: ForeignKey<Connector["id"]>;
}

GoogleDriveWebhook.init(
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
    webhookId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    renewedByWebhookId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    renewAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize: sequelize_conn,
    modelName: "google_drive_webhooks",
    indexes: [
      { fields: ["webhookId"], unique: true },
      { fields: ["renewAt"] },
      { fields: ["connectorId"] },
    ],
  }
);
Connector.hasOne(GoogleDriveWebhook);
