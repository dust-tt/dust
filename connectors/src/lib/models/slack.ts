import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { connectorsSequelize } from "@connectors/resources/storage";
import { ConnectorBaseModel } from "@connectors/resources/storage/wrappers/model_with_connectors";
import type {
  ConnectorPermission,
  SlackAutoReadPattern,
  SlackbotWhitelistType,
} from "@connectors/types";

export class SlackConfigurationModel extends ConnectorBaseModel<SlackConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare slackTeamId: string;
  declare botEnabled: boolean;
  declare restrictedSpaceAgentsEnabled: boolean;
  // Whitelisted domains are in the format "domain:group_id".
  declare whitelistedDomains?: readonly string[];
  declare autoReadChannelPatterns: SlackAutoReadPattern[];
}

SlackConfigurationModel.init(
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
    autoReadChannelPatterns: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    restrictedSpaceAgentsEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize: connectorsSequelize,
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
    relationship: "hasOne",
  }
);

export class SlackMessages extends ConnectorBaseModel<SlackMessages> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare channelId: string;
  declare messageTs?: string;
  declare documentId: string;
  declare skipReason?: string;
}
SlackMessages.init(
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
    skipReason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize: connectorsSequelize,
    modelName: "slack_messages",
    indexes: [
      { fields: ["connectorId", "channelId", "documentId"], unique: true },
    ],
  }
);

export class SlackChannel extends ConnectorBaseModel<SlackChannel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare slackChannelId: string;
  declare slackChannelName: string;

  declare skipReason: string | null;

  declare private: boolean;

  declare permission: ConnectorPermission;
  declare agentConfigurationId: CreationOptional<string | null>;
  declare autoRespondWithoutMention: CreationOptional<boolean>;
}
SlackChannel.init(
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
    slackChannelId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    slackChannelName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    skipReason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    private: {
      type: DataTypes.BOOLEAN,
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
    autoRespondWithoutMention: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize: connectorsSequelize,
    modelName: "slack_channels",
    indexes: [
      { fields: ["connectorId", "slackChannelId"], unique: true },
      { fields: ["connectorId"] },
    ],
  }
);

export class SlackChatBotMessage extends ConnectorBaseModel<SlackChatBotMessage> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
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
    createdAt: {
      type: DataTypes.DATE,
    },
    updatedAt: {
      type: DataTypes.DATE,
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
    sequelize: connectorsSequelize,
    modelName: "slack_chat_bot_messages",
    indexes: [{ fields: ["connectorId", "channelId", "threadTs"] }],
  }
);

export class SlackBotWhitelistModel extends ConnectorBaseModel<SlackBotWhitelistModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare botName: string;
  declare groupIds: string[];
  declare whitelistType: SlackbotWhitelistType;
  declare slackConfigurationId: ForeignKey<SlackConfigurationModel["id"]>;
}

SlackBotWhitelistModel.init(
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
    botName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    whitelistType: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "summon_agent",
    },
    groupIds: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
  },
  {
    sequelize: connectorsSequelize,
    indexes: [{ fields: ["connectorId", "botName"], unique: true }],
    modelName: "slack_bot_whitelist",
    tableName: "slack_bot_whitelist",
  }
);

SlackConfigurationModel.hasMany(SlackBotWhitelistModel);
