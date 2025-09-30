import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes, literal } from "sequelize";

import type { AgentMessageFeedbackDirection } from "@app/lib/api/assistant/conversation/feedbacks";
import type { AgentStepContentModel } from "@app/lib/models/assistant/agent_step_content";
import type { TriggerModel } from "@app/lib/models/assistant/triggers/triggers";
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
  declare depth: CreationOptional<number>;
  declare triggerId: ForeignKey<TriggerModel["id"]> | null;

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
    depth: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    requestedGroupIds: {
      type: DataTypes.ARRAY(DataTypes.ARRAY(DataTypes.BIGINT)),
      allowNull: false,
      defaultValue: [],
    },
    triggerId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    modelName: "conversation",
    indexes: [
      // TODO(WORKSPACE_ID_ISOLATION 2025-05-12): Remove index
      {
        unique: true,
        fields: ["sId"],
      },
      {
        fields: ["workspaceId"],
        name: "conversations_wId_idx",
      },
      {
        unique: true,
        fields: ["workspaceId", "sId"],
      },
    ],
    sequelize: frontSequelize,
  }
);

export class ConversationParticipantModel extends WorkspaceAwareModel<ConversationParticipantModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare action: ParticipantActionType;
  declare unread: boolean;
  declare actionRequired: boolean;

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
    unread: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    actionRequired: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    modelName: "conversation_participant",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["userId"],
      },
      // TODO(WORKSPACE_ID_ISOLATION 2025-05-12): Remove index
      {
        fields: ["userId", "conversationId"],
        unique: true,
      },
      {
        fields: ["workspaceId", "userId", "conversationId"],
        unique: true,
      },
      {
        fields: ["conversationId"],
        concurrently: true,
      },
      // TODO(WORKSPACE_ID_ISOLATION 2025-05-12): Remove index
      {
        fields: ["userId", "action"],
        concurrently: true,
      },
      {
        fields: ["workspaceId", "userId", "action"],
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

  // TODO(MCP Clean-up): Remove these once we have migrated to the new MCP server ids.
  declare localMCPServerIds?: string[];
  declare clientSideMCPServerIds: string[];

  declare userContextUsername: string;
  declare userContextTimezone: string;
  declare userContextFullName: string | null;
  declare userContextEmail: string | null;
  declare userContextProfilePictureUrl: string | null;
  declare userContextOrigin: UserMessageOrigin | null;
  declare userContextOriginMessageId: string | null;

  declare userContextLastTriggerRunAt: Date | null;

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
    // TODO(MCP Clean-up): Remove these once we have migrated to the new MCP server ids.
    localMCPServerIds: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
    },
    clientSideMCPServerIds: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
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
    userContextOriginMessageId: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    userContextLastTriggerRunAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    modelName: "user_message",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["userContextOrigin"], concurrently: true },
      { fields: ["workspaceId"], concurrently: true },
      {
        // WARNING we use full capital functions and constants as the query where we want this index to be used is in capital letters, and indices are case-sensitive
        // The query https://github.com/dust-tt/dust/blob/6cb11eecb8c8bb549efc5afb25197606d76672b9/front/pages/api/w/%5BwId%5D/workspace-analytics.ts#L67-L126
        fields: [
          "workspaceId",
          literal("DATE(TIMEZONE('UTC', \"createdAt\"))"),
          "userId",
        ],
        concurrently: true,
        name: "user_messages_workspace_id_date_created_at_user_id_idx",
      },
    ],
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
  declare errorMetadata: Record<string, string | number | boolean> | null;

  declare skipToolsValidation: boolean;

  // Not a relation as global agents are not in the DB + sId is stable across versions. Both sId and
  // version are needed to uniquely identify the agent configuration.
  declare agentConfigurationId: string;
  declare agentConfigurationVersion: number;

  declare agentStepContents?: NonAttribute<AgentStepContentModel[]>;
  declare message?: NonAttribute<Message>;
  declare feedbacks?: NonAttribute<AgentMessageFeedback[]>;

  declare completedAt: Date | null;
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
    errorMetadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
      validate: {
        isValidJSON(value: any) {
          if (value !== null && typeof value !== "object") {
            throw new Error("errorMetadata must be an object or null");
          }
          if (
            value !== null &&
            !Object.values(value).every(
              (v) =>
                typeof v === "string" ||
                typeof v === "number" ||
                typeof v === "boolean"
            )
          ) {
            throw new Error(
              "errorMetadata values must be string | number | boolean"
            );
          }
        },
      },
    },
    skipToolsValidation: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
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
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    modelName: "agent_message",
    sequelize: frontSequelize,
    indexes: [{ fields: ["workspaceId"], concurrently: true }],
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
      { fields: ["workspaceId"], concurrently: true },
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
      // TODO(WORKSPACE_ID_ISOLATION 2025-05-13): Remove index
      {
        unique: true,
        fields: ["conversationId", "rank", "version"],
      },
      {
        unique: true,
        fields: ["workspaceId", "conversationId", "rank", "version"],
        concurrently: true,
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
      {
        fields: ["workspaceId", "conversationId"],
      },
      {
        fields: ["workspaceId", "conversationId", "sId"],
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
      { fields: ["workspaceId"], concurrently: true },
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
      // TODO(WORKSPACE_ID_ISOLATION 2025-05-12): Remove index
      {
        fields: ["messageId"],
      },
      {
        fields: ["workspaceId", "messageId"],
      },
      // TODO(WORKSPACE_ID_ISOLATION 2025-05-12): Remove index
      {
        fields: ["agentConfigurationId", "createdAt"],
      },
      {
        fields: ["workspaceId", "agentConfigurationId", "createdAt"],
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
