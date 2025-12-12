import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes, literal } from "sequelize";

import type { AgentMessageFeedbackDirection } from "@app/lib/api/assistant/conversation/feedbacks";
import type { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import { TriggerModel } from "@app/lib/models/agent/triggers/triggers";
import { frontSequelize } from "@app/lib/resources/storage";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
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
  declare hasError: CreationOptional<boolean>;

  declare requestedSpaceIds: number[];

  // Note: Using spaceId for the FK instead of vaultId as it is not a "ResourceWithSpace" and it's aligned with "requestedSpaceIds".
  declare spaceId: ForeignKey<SpaceModel["id"]> | null;
  declare space: NonAttribute<SpaceModel>;
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
    requestedSpaceIds: {
      type: DataTypes.ARRAY(DataTypes.BIGINT),
      allowNull: false,
      defaultValue: [],
    },
    hasError: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    modelName: "conversation",
    indexes: [
      {
        unique: true,
        fields: ["workspaceId", "sId"],
      },
      {
        fields: ["workspaceId", "triggerId"],
      },
      {
        fields: ["workspaceId", "spaceId"],
      },
    ],
    sequelize: frontSequelize,
  }
);

ConversationModel.belongsTo(TriggerModel, {
  as: "trigger",
  foreignKey: {
    name: "triggerId",
    allowNull: true,
  },
  onDelete: "SET NULL",
});

TriggerModel.hasMany(ConversationModel, {
  as: "conversations",
  foreignKey: {
    name: "triggerId",
    allowNull: true,
  },
  onDelete: "SET NULL",
});

ConversationModel.belongsTo(SpaceModel, {
  as: "space",
  foreignKey: {
    name: "spaceId",
    allowNull: true,
  },
  onDelete: "RESTRICT",
});

SpaceModel.hasMany(ConversationModel, {
  as: "conversations",
});

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
        fields: ["workspaceId", "userId", "conversationId"],
        unique: true,
      },
      {
        fields: ["workspaceId", "conversationId"],
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

export class UserMessageModel extends WorkspaceAwareModel<UserMessageModel> {
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
  declare userContextOrigin: UserMessageOrigin;
  // TODO(2025-11-24 PPUL): Remove this once data has been backfilled
  declare userContextOriginMessageId: string | null;

  declare agenticMessageType: "run_agent" | "agent_handover" | null;
  declare agenticOriginMessageId: string | null;

  declare userContextLastTriggerRunAt: Date | null;

  declare userId: ForeignKey<UserModel["id"]> | null;

  declare user?: NonAttribute<UserModel>;
}

UserMessageModel.init(
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
      allowNull: false,
    },
    // TODO: Remove this once backfilled
    userContextOriginMessageId: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    userContextLastTriggerRunAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    agenticMessageType: {
      type: DataTypes.STRING(16),
      allowNull: true,
    },
    agenticOriginMessageId: {
      type: DataTypes.STRING(32),
      allowNull: true,
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
    hooks: {
      beforeValidate: (userMessage) => {
        const hasAgenticMessageType = !!userMessage.agenticMessageType;
        const hasAgenticOriginMessageId = !!userMessage.agenticOriginMessageId;
        if (hasAgenticMessageType !== hasAgenticOriginMessageId) {
          throw new Error(
            "agenticMessageType and agenticOriginMessageId must be set together"
          );
        }
      },
    },
  }
);

UserModel.hasMany(UserMessageModel, {
  foreignKey: { name: "userId", allowNull: true }, // null = message is not associated with a user
});
UserMessageModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: true },
});

export class AgentMessageModel extends WorkspaceAwareModel<AgentMessageModel> {
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
  declare message?: NonAttribute<MessageModel>;
  declare feedbacks?: NonAttribute<AgentMessageFeedbackModel[]>;

  declare modelInteractionDurationMs: number | null;
  declare completedAt: Date | null;
}

AgentMessageModel.init(
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
    modelInteractionDurationMs: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
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
    indexes: [
      { fields: ["workspaceId"], concurrently: true },
      // Index for agent-based data retention queries.
      { fields: ["workspaceId", "agentConfigurationId"], concurrently: true },
    ],
  }
);

export class AgentMessageFeedbackModel extends WorkspaceAwareModel<AgentMessageFeedbackModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfigurationId: string;
  declare agentConfigurationVersion: number;
  declare agentMessageId: ForeignKey<AgentMessageModel["id"]>;
  declare userId: ForeignKey<UserModel["id"]>;
  declare isConversationShared: boolean;
  declare dismissed: boolean;

  declare thumbDirection: AgentMessageFeedbackDirection;
  declare content: string | null;

  declare agentMessage: NonAttribute<AgentMessageModel>;
  declare user: NonAttribute<UserModel>;
}

AgentMessageFeedbackModel.init(
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
    dismissed: {
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

AgentMessageModel.hasMany(AgentMessageFeedbackModel, {
  as: "feedbacks",
  onDelete: "RESTRICT",
});
UserModel.hasMany(AgentMessageFeedbackModel, {
  onDelete: "SET NULL",
});
AgentMessageFeedbackModel.belongsTo(UserModel, {
  as: "user",
});
AgentMessageFeedbackModel.belongsTo(AgentMessageModel, {
  as: "agentMessage",
});

export class MessageModel extends WorkspaceAwareModel<MessageModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;

  declare version: CreationOptional<number>;
  declare rank: number;
  declare visibility: CreationOptional<MessageVisibility>;

  declare conversationId: ForeignKey<ConversationModel["id"]>;

  declare parentId: ForeignKey<MessageModel["id"]> | null;
  declare userMessageId: ForeignKey<UserMessageModel["id"]> | null;
  declare agentMessageId: ForeignKey<AgentMessageModel["id"]> | null;
  declare contentFragmentId: ForeignKey<ContentFragmentModel["id"]> | null;

  declare userMessage?: NonAttribute<UserMessageModel>;
  declare agentMessage?: NonAttribute<AgentMessageModel>;
  declare contentFragment?: NonAttribute<ContentFragmentModel>;
  declare reactions?: NonAttribute<MessageReactionModel[]>;

  declare conversation?: NonAttribute<ConversationModel>;
}

MessageModel.init(
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
      // Index for data retention workflow - optimizes GROUP BY with MAX(createdAt).
      {
        fields: ["workspaceId", "conversationId", "createdAt"],
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

ConversationModel.hasMany(MessageModel, {
  foreignKey: { name: "conversationId", allowNull: false },
  onDelete: "RESTRICT",
});
MessageModel.belongsTo(ConversationModel, {
  as: "conversation",
  foreignKey: { name: "conversationId", allowNull: false },
});

UserMessageModel.hasOne(MessageModel, {
  as: "message",
  foreignKey: { name: "userMessageId", allowNull: true },
});
MessageModel.belongsTo(UserMessageModel, {
  as: "userMessage",
  foreignKey: { name: "userMessageId", allowNull: true },
});

AgentMessageModel.hasOne(MessageModel, {
  as: "message",
  foreignKey: { name: "agentMessageId", allowNull: true },
});
MessageModel.belongsTo(AgentMessageModel, {
  as: "agentMessage",
  foreignKey: { name: "agentMessageId", allowNull: true },
});

MessageModel.belongsTo(MessageModel, {
  foreignKey: { name: "parentId", allowNull: true },
});
ContentFragmentModel.hasOne(MessageModel, {
  as: "message",
  foreignKey: { name: "contentFragmentId", allowNull: true },
});
MessageModel.belongsTo(ContentFragmentModel, {
  as: "contentFragment",
  foreignKey: { name: "contentFragmentId", allowNull: true },
});
export class MessageReactionModel extends WorkspaceAwareModel<MessageReactionModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare messageId: ForeignKey<MessageModel["id"]>;

  // User is nullable so that we can store reactions from a Slackbot message
  declare userId: ForeignKey<UserModel["id"]> | null;
  declare userContextUsername: string;
  declare userContextFullName: string | null;

  declare reaction: string;
}

MessageReactionModel.init(
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

MessageModel.hasMany(MessageReactionModel, {
  as: "reactions",
  foreignKey: { name: "messageId", allowNull: false },
  onDelete: "RESTRICT",
});
MessageReactionModel.belongsTo(MessageModel, {
  foreignKey: { name: "messageId", allowNull: false },
});
UserModel.hasMany(MessageReactionModel, {
  foreignKey: { name: "userId", allowNull: true }, // null = mention is from a user using a Slackbot
});
MessageReactionModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: true }, // null = mention is not a user using a Slackbot
});

export class PendingMentionModel extends WorkspaceAwareModel<PendingMentionModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare conversationId: ForeignKey<ConversationModel["id"]>;
  declare messageId: ForeignKey<MessageModel["id"]>;
  declare mentionedUserId: ForeignKey<UserModel["id"]>;
  declare mentionerUserId: ForeignKey<UserModel["id"]>;
  declare status: "pending" | "accepted" | "declined";

  declare conversation?: NonAttribute<ConversationModel>;
  declare message?: NonAttribute<MessageModel>;
  declare mentionedUser?: NonAttribute<UserModel>;
  declare mentionerUser?: NonAttribute<UserModel>;
}

PendingMentionModel.init(
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
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "pending",
    },
  },
  {
    modelName: "pending_mention",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "conversationId", "status"],
      },
      {
        fields: ["workspaceId", "messageId", "mentionedUserId"],
      },
      {
        fields: ["mentionerUserId", "status"],
      },
    ],
  }
);

ConversationModel.hasMany(PendingMentionModel, {
  foreignKey: { name: "conversationId", allowNull: false },
  onDelete: "RESTRICT",
});
PendingMentionModel.belongsTo(ConversationModel, {
  as: "conversation",
  foreignKey: { name: "conversationId", allowNull: false },
});

MessageModel.hasMany(PendingMentionModel, {
  foreignKey: { name: "messageId", allowNull: false },
  onDelete: "CASCADE",
});
PendingMentionModel.belongsTo(MessageModel, {
  as: "message",
  foreignKey: { name: "messageId", allowNull: false },
});

UserModel.hasMany(PendingMentionModel, {
  as: "pendingMentionsAsMentioned",
  foreignKey: { name: "mentionedUserId", allowNull: false },
});
PendingMentionModel.belongsTo(UserModel, {
  as: "mentionedUser",
  foreignKey: { name: "mentionedUserId", allowNull: false },
});

UserModel.hasMany(PendingMentionModel, {
  as: "pendingMentionsAsMentioner",
  foreignKey: { name: "mentionerUserId", allowNull: false },
});
PendingMentionModel.belongsTo(UserModel, {
  as: "mentionerUser",
  foreignKey: { name: "mentionerUserId", allowNull: false },
});

export class MentionModel extends WorkspaceAwareModel<MentionModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare messageId: ForeignKey<MessageModel["id"]>;

  // a Mention is either an agent mention xor a user mention
  declare agentConfigurationId: string | null; // Not a relation as global agents are not in the DB
  declare userId: ForeignKey<UserModel["id"]> | null;
  declare user: NonAttribute<UserModel> | null;

  declare message: NonAttribute<MessageModel>;
}

MentionModel.init(
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
    userId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: {
        model: UserModel,
        key: "id",
      },
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
    hooks: {
      beforeValidate: (mention) => {
        if (
          Number(!!mention.userId) + Number(!!mention.agentConfigurationId) !==
          1
        ) {
          throw new Error(
            "Exactly one of userId, agentConfigurationId must be non-null"
          );
        }
      },
    },
  }
);

MessageModel.hasMany(MentionModel, {
  foreignKey: { name: "messageId", allowNull: false },
  onDelete: "RESTRICT",
});
MentionModel.belongsTo(MessageModel, {
  foreignKey: { name: "messageId", allowNull: false },
});
MentionModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: true },
});
