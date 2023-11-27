import {
  type CreationOptional,
  DataTypes,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
} from "sequelize";

import { Connector, sequelize_conn } from "@connectors/lib/models";
import { ConnectorPermission } from "@connectors/types/resources";

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
  declare agentConfigurationId: CreationOptional<string | null>;
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
    agentConfigurationId: {
      type: DataTypes.STRING,
      allowNull: true,
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
  declare slackFullName: string | null;
  declare slackAvatar: string | null;
  declare slackTimezone: string | null;
  declare messageTs: string | null;
  declare threadTs: string | null;
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
    threadTs: {
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
      allowNull: true,
    },
    slackAvatar: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize: sequelize_conn,
    modelName: "slack_chat_bot_messages",
    indexes: [{ fields: ["connectorId", "channelId", "threadTs"] }],
  }
);
Connector.hasOne(SlackChatBotMessage);
