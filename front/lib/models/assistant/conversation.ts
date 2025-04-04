import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import type { AgentMessageFeedbackDirection } from "@app/lib/api/assistant/conversation/feedbacks";
import type { AgentMessageContent } from "@app/lib/models/assistant/agent_message_content";
import { frontSequelize } from "@app/lib/resources/storage";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type {
  AgentMessageStatus,
  ConversationVisibility,
  MessageVisibility,
  ParticipantActionType,
  UserMessageOrigin,
} from "@app/types";

export class ConversationModel extends WorkspaceAwareModel<ConversationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;
  declare title: string | null;
  declare visibility: CreationOptional<ConversationVisibility>;

  declare requestedGroupIds: number[][];
}

ConversationModel.init(
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
    title: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    visibility: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "unlisted",
    },
    requestedGroupIds: {
      type: DataTypes.ARRAY(DataTypes.ARRAY(DataTypes.BIGINT)),
      allowNull: false,
      defaultValue: [],
    },
  },
  {
    modelName: "conversation",
    indexes: [
      {
        unique: true,
        fields: ["sId"],
      },
      {
        fields: ["workspaceId"],
        name: "conversations_wId_idx",
      },
    ],
    sequelize: frontSequelize,
  }
);

export class ConversationParticipantModel extends WorkspaceAwareModel<ConversationParticipantModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare action: ParticipantActionType;

  declare conversationId: ForeignKey<ConversationModel["id"]>;
  declare userId: ForeignKey<UserModel["id"]>;

  declare conversation?: NonAttribute<ConversationModel>;
  declare user?: NonAttribute<UserModel>;
}
ConversationParticipantModel.init(
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
    action: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "conversation_participant",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["userId"],
      },
      {
        fields: ["userId", "conversationId"],
        unique: true,
      },
      {
        fields: ["conversationId"],
        concurrently: true,
      },
      {
        fields: ["userId", "action"],
        concurrently: true,
      },
    ],
  }
);
ConversationModel.hasMany(ConversationParticipantModel, {
  foreignKey: { name: "conversationId", allowNull: false },
  onDelete: "RESTRICT",
});
ConversationParticipantModel.belongsTo(ConversationModel, {
  foreignKey: { name: "conversationId", allowNull: false },
});
UserModel.hasMany(ConversationParticipantModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
});
ConversationParticipantModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: false },
});

export class UserMessage extends WorkspaceAwareModel<UserMessage> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare content: string;

  declare userContextUsername: string;
  declare userContextTimezone: string;
  declare userContextFullName: string | null;
  declare userContextEmail: string | null;
  declare userContextProfilePictureUrl: string | null;
  declare userContextOrigin: UserMessageOrigin | null;

  declare userId: ForeignKey<UserModel["id"]> | null;
}

UserMessage.init(
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
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    userContextUsername: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    userContextTimezone: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    userContextFullName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    userContextEmail: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    userContextProfilePictureUrl: {
      type: DataTypes.STRING(2048),
      allowNull: true,
    },
    userContextOrigin: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "user_message",
    sequelize: frontSequelize,
  }
);

UserModel.hasMany(UserMessage, {
  foreignKey: { name: "userId", allowNull: true }, // null = message is not associated with a user
});
UserMessage.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: true },
});

export class AgentMessage extends WorkspaceAwareModel<AgentMessage> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare runIds: string[] | null;
  declare status: CreationOptional<AgentMessageStatus>;

  declare errorCode: string | null;
  declare errorMessage: string | null;

  // Not a relation as global agents are not in the DB
  // needs both sId and version to uniquely identify the agent configuration
  declare agentConfigurationId: string;
  declare agentConfigurationVersion: number;

  declare agentMessageContents?: NonAttribute<AgentMessageContent[]>;
  declare message?: NonAttribute<Message>;
  declare feedbacks?: NonAttribute<AgentMessageFeedback[]>;
}

AgentMessage.init(
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
    runIds: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "created",
    },
    errorCode: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    agentConfigurationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    agentConfigurationVersion: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    modelName: "agent_message",
    sequelize: frontSequelize,
  }
);

export class AgentMessageFeedback extends WorkspaceAwareModel<AgentMessageFeedback> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfigurationId: string;
  declare agentConfigurationVersion: number;
  declare agentMessageId: ForeignKey<AgentMessage["id"]>;
  declare userId: ForeignKey<UserModel["id"]>;
  declare isConversationShared: boolean;

  declare thumbDirection: AgentMessageFeedbackDirection;
  declare content: string | null;

  declare agentMessage: NonAttribute<AgentMessage>;
  declare user: NonAttribute<UserModel>;
}

AgentMessageFeedback.init(
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
    agentConfigurationId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    agentConfigurationVersion: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    thumbDirection: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isConversationShared: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    modelName: "agent_message_feedback",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["agentConfigurationId"],
      },
      {
        fields: ["agentMessageId"],
      },
      {
        fields: ["userId"],
      },
      {
        fields: ["agentConfigurationId", "agentMessageId", "userId"],
        unique: true,
        name: "agent_message_feedbacks_agent_configuration_id_agent_message_id",
      },
    ],
  }
);

AgentMessage.hasMany(AgentMessageFeedback, {
  as: "feedbacks",
  onDelete: "RESTRICT",
});
UserModel.hasMany(AgentMessageFeedback, {
  onDelete: "SET NULL",
});
AgentMessageFeedback.belongsTo(UserModel, {
  as: "user",
});
AgentMessageFeedback.belongsTo(AgentMessage, {
  as: "agentMessage",
});

export class Message extends WorkspaceAwareModel<Message> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;

  declare version: CreationOptional<number>;
  declare rank: number;
  declare visibility: CreationOptional<MessageVisibility>;

  declare conversationId: ForeignKey<ConversationModel["id"]>;

  declare parentId: ForeignKey<Message["id"]> | null;
  declare userMessageId: ForeignKey<UserMessage["id"]> | null;
  declare agentMessageId: ForeignKey<AgentMessage["id"]> | null;
  declare contentFragmentId: ForeignKey<ContentFragmentModel["id"]> | null;

  declare userMessage?: NonAttribute<UserMessage>;
  declare agentMessage?: NonAttribute<AgentMessage>;
  declare contentFragment?: NonAttribute<ContentFragmentModel>;
  declare reactions?: NonAttribute<MessageReaction[]>;

  declare conversation?: NonAttribute<ConversationModel>;
}

Message.init(
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
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    visibility: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "visible",
    },
    rank: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    modelName: "message",
    sequelize: frontSequelize,
    indexes: [
      {
        unique: true,
        fields: ["sId"],
      },
      {
        unique: true,
        fields: ["conversationId", "rank", "version"],
      },
      {
        fields: ["agentMessageId"],
        concurrently: true,
      },
      {
        fields: ["userMessageId"],
        concurrently: true,
      },
      {
        fields: ["contentFragmentId"],
        concurrently: true,
      },
      {
        fields: ["parentId"],
        concurrently: true,
      },
    ],
    hooks: {
      beforeValidate: (message) => {
        if (
          Number(!!message.userMessageId) +
            Number(!!message.agentMessageId) +
            Number(!!message.contentFragmentId) !==
          1
        ) {
          throw new Error(
            "Exactly one of userMessageId, agentMessageId, contentFragmentId must be non-null"
          );
        }
      },
    },
  }
);

ConversationModel.hasMany(Message, {
  foreignKey: { name: "conversationId", allowNull: false },
  onDelete: "RESTRICT",
});
Message.belongsTo(ConversationModel, {
  as: "conversation",
  foreignKey: { name: "conversationId", allowNull: false },
});

UserMessage.hasOne(Message, {
  as: "message",
  foreignKey: { name: "userMessageId", allowNull: true },
});
Message.belongsTo(UserMessage, {
  as: "userMessage",
  foreignKey: { name: "userMessageId", allowNull: true },
});

AgentMessage.hasOne(Message, {
  as: "message",
  foreignKey: { name: "agentMessageId", allowNull: true },
});
Message.belongsTo(AgentMessage, {
  as: "agentMessage",
  foreignKey: { name: "agentMessageId", allowNull: true },
});

Message.belongsTo(Message, {
  foreignKey: { name: "parentId", allowNull: true },
});
ContentFragmentModel.hasOne(Message, {
  as: "message",
  foreignKey: { name: "contentFragmentId", allowNull: true },
});
Message.belongsTo(ContentFragmentModel, {
  as: "contentFragment",
  foreignKey: { name: "contentFragmentId", allowNull: true },
});

export class MessageReaction extends WorkspaceAwareModel<MessageReaction> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare messageId: ForeignKey<Message["id"]>;

  // User is nullable so that we can store reactions from a Slackbot message
  declare userId: ForeignKey<UserModel["id"]> | null;
  declare userContextUsername: string;
  declare userContextFullName: string | null;

  declare reaction: string;
}

MessageReaction.init(
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
    userContextUsername: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    userContextFullName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    reaction: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "message_reaction",
    sequelize: frontSequelize,
    indexes: [
      {
        unique: true,
        fields: ["messageId", "reaction", "userContextUsername"], // Not perfect as that means that a user and slack user with the same username can't react with the same emoji, but that's an edge case.
      },
      { fields: ["messageId"] },
      {
        fields: ["userId"],
        concurrently: true,
      },
    ],
  }
);

Message.hasMany(MessageReaction, {
  as: "reactions",
  foreignKey: { name: "messageId", allowNull: false },
  onDelete: "RESTRICT",
});
MessageReaction.belongsTo(Message, {
  foreignKey: { name: "messageId", allowNull: false },
});
UserModel.hasMany(MessageReaction, {
  foreignKey: { name: "userId", allowNull: true }, // null = mention is from a user using a Slackbot
});
MessageReaction.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: true }, // null = mention is not a user using a Slackbot
});

export class Mention extends WorkspaceAwareModel<Mention> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare messageId: ForeignKey<Message["id"]>;
  declare agentConfigurationId: string | null; // Not a relation as global agents are not in the DB

  declare message: NonAttribute<Message>;
}

Mention.init(
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
    agentConfigurationId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "mention",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["messageId"],
      },
      {
        fields: ["agentConfigurationId", "createdAt"],
      },
    ],
  }
);

Message.hasMany(Mention, {
  foreignKey: { name: "messageId", allowNull: false },
  onDelete: "RESTRICT",
});
Mention.belongsTo(Message, {
  foreignKey: { name: "messageId", allowNull: false },
});
