import type { ConnectorPermission } from "@dust-tt/types";
import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

export class SlackConfigurationModel extends Model<
  InferAttributes<SlackConfigurationModel>,
  InferCreationAttributes<SlackConfigurationModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare slackTeamId: string;
  declare botEnabled: boolean;
  declare connectorId: ForeignKey<ConnectorModel["id"]>;
  declare whitelistedDomains?: readonly string[];
  declare autoReadChannelPattern?: string | null;
}
SlackConfigurationModel.init(
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
    whitelistedDomains: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    autoReadChannelPattern: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize: sequelizeConnection,
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
ConnectorModel.hasOne(SlackConfigurationModel);

export class SlackMessages extends Model<
  InferAttributes<SlackMessages>,
  InferCreationAttributes<SlackMessages>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare connectorId: ForeignKey<ConnectorModel["id"]>;
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
    sequelize: sequelizeConnection,
    modelName: "slack_messages",
    indexes: [
      { fields: ["connectorId", "channelId", "messageTs"], unique: true },
    ],
  }
);
ConnectorModel.hasOne(SlackMessages);

export class SlackChannel extends Model<
  InferAttributes<SlackChannel>,
  InferCreationAttributes<SlackChannel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare connectorId: ForeignKey<ConnectorModel["id"]>;
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
    sequelize: sequelizeConnection,
    modelName: "slack_channels",
    indexes: [
      { fields: ["connectorId", "slackChannelId"], unique: true },
      { fields: ["connectorId"] },
    ],
  }
);
ConnectorModel.hasMany(SlackChannel);

export class SlackChatBotMessage extends Model<
  InferAttributes<SlackChatBotMessage>,
  InferCreationAttributes<SlackChatBotMessage>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare connectorId: ForeignKey<ConnectorModel["id"]>;
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
  declare userType: "bot" | "user";
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
    userType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "slack_chat_bot_messages",
    indexes: [{ fields: ["connectorId", "channelId", "threadTs"] }],
  }
);
ConnectorModel.hasOne(SlackChatBotMessage);

export class SlackBotWhitelistModel extends Model<
  InferAttributes<SlackBotWhitelistModel>,
  InferCreationAttributes<SlackBotWhitelistModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare botName: string;
  declare groupIds: string[];
  declare connectorId: ForeignKey<ConnectorModel["id"]>;
  declare slackConfigurationId: ForeignKey<SlackConfigurationModel["id"]>;
}

SlackBotWhitelistModel.init(
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
    botName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    groupIds: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
  },
  {
    sequelize: sequelizeConnection,
    indexes: [{ fields: ["connectorId", "botName"], unique: true }],
    modelName: "slack_bot_whitelist",
    tableName: "slack_bot_whitelist",
  }
);

ConnectorModel.hasMany(SlackBotWhitelistModel);
SlackConfigurationModel.hasMany(SlackBotWhitelistModel);
