import {
  AgentMessageStatus,
  ContentFragmentContentType,
  ConversationVisibility,
  MessageVisibility,
  ParticipantActionType,
} from "@dust-tt/types";
import {
  CreationOptional,
  DataTypes,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from "sequelize";

import { front_sequelize } from "@app/lib/databases";
import { AgentRetrievalAction } from "@app/lib/models/assistant/actions/retrieval";
import { User } from "@app/lib/models/user";
import { Workspace } from "@app/lib/models/workspace";

import { AgentDustAppRunAction } from "./actions/dust_app_run";

export class Conversation extends Model<
  InferAttributes<Conversation>,
  InferCreationAttributes<Conversation>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;
  declare title: string | null;
  declare visibility: CreationOptional<ConversationVisibility>;

  declare workspaceId: ForeignKey<Workspace["id"]>;
}

Conversation.init(
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
  },
  {
    modelName: "conversation",
    indexes: [
      {
        unique: true,
        fields: ["sId"],
      },
    ],
    sequelize: front_sequelize,
  }
);

Workspace.hasMany(Conversation, {
  foreignKey: { name: "workspaceId", allowNull: false },
  onDelete: "CASCADE",
});

Conversation.belongsTo(Workspace, {
  foreignKey: { name: "workspaceId", allowNull: false },
});

export class ConversationParticipant extends Model<
  InferAttributes<ConversationParticipant>,
  InferCreationAttributes<ConversationParticipant>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare action: ParticipantActionType;

  declare conversationId: ForeignKey<Conversation["id"]>;
  declare userId: ForeignKey<User["id"]>;

  declare conversation?: NonAttribute<Conversation>;
  declare user?: NonAttribute<User>;
}
ConversationParticipant.init(
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
    action: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "conversation_participant",
    sequelize: front_sequelize,
    indexes: [
      {
        fields: ["userId"],
      },
      {
        fields: ["userId", "conversationId"],
        unique: true,
      },
    ],
  }
);
Conversation.hasMany(ConversationParticipant, {
  foreignKey: { name: "conversationId", allowNull: false },
  onDelete: "CASCADE",
});
ConversationParticipant.belongsTo(Conversation, {
  foreignKey: { name: "conversationId", allowNull: false },
});
User.hasMany(ConversationParticipant, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "CASCADE",
});
ConversationParticipant.belongsTo(User, {
  foreignKey: { name: "userId", allowNull: false },
});

export class UserMessage extends Model<
  InferAttributes<UserMessage>,
  InferCreationAttributes<UserMessage>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare content: string;

  declare userContextUsername: string;
  declare userContextTimezone: string;
  declare userContextFullName: string | null;
  declare userContextEmail: string | null;
  declare userContextProfilePictureUrl: string | null;

  declare userId: ForeignKey<User["id"]> | null;
}

UserMessage.init(
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
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "user_message",
    sequelize: front_sequelize,
  }
);

User.hasMany(UserMessage, {
  foreignKey: { name: "userId", allowNull: true }, // null = message is not associated with a user
});
UserMessage.belongsTo(User, {
  foreignKey: { name: "userId", allowNull: true },
});

export class AgentMessage extends Model<
  InferAttributes<AgentMessage>,
  InferCreationAttributes<AgentMessage>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare status: CreationOptional<AgentMessageStatus>;

  declare content: string | null;
  declare errorCode: string | null;
  declare errorMessage: string | null;

  declare agentRetrievalActionId: ForeignKey<AgentRetrievalAction["id"]> | null;
  declare agentDustAppRunActionId: ForeignKey<
    AgentDustAppRunAction["id"]
  > | null;

  // Not a relation as global agents are not in the DB
  // needs both sId and version to uniquely identify the agent configuration
  declare agentConfigurationId: string;
  declare agentConfigurationVersion: number;
}

AgentMessage.init(
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
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "created",
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true,
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
    indexes: [
      {
        unique: true,
        fields: ["agentRetrievalActionId"],
      },
    ],
    sequelize: front_sequelize,
    hooks: {
      beforeValidate: (agentMessage: AgentMessage) => {
        if (
          agentMessage.agentRetrievalActionId &&
          agentMessage.agentDustAppRunActionId
        ) {
          throw new Error(
            "agentRetrievalActionId and AgentDustAppRunActionId must be exclusive"
          );
        }
      },
    },
  }
);

AgentRetrievalAction.hasOne(AgentMessage, {
  foreignKey: { name: "agentRetrievalActionId", allowNull: true }, // null = no Retrieval action set for this Agent
  onDelete: "CASCADE",
});
AgentMessage.belongsTo(AgentRetrievalAction, {
  foreignKey: { name: "agentRetrievalActionId", allowNull: true }, // null = no Retrieval action set for this Agent
});

AgentDustAppRunAction.hasOne(AgentMessage, {
  foreignKey: { name: "agentDustAppRunActionId", allowNull: true }, // null = no DustAppRun action set for this Agent
  onDelete: "CASCADE",
});
AgentMessage.belongsTo(AgentDustAppRunAction, {
  foreignKey: { name: "agentDustAppRunActionId", allowNull: true }, // null = no DustAppRun action set for this Agent
});

export class ContentFragment extends Model<
  InferAttributes<ContentFragment>,
  InferCreationAttributes<ContentFragment>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare title: string;
  declare content: string;
  declare url: string | null;
  declare contentType: ContentFragmentContentType;

  declare userContextUsername: string | null;
  declare userContextFullName: string | null;
  declare userContextEmail: string | null;
  declare userContextProfilePictureUrl: string | null;

  declare userId: ForeignKey<User["id"]> | null;
}

ContentFragment.init(
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
    title: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    url: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    contentType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    userContextProfilePictureUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    userContextUsername: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    userContextFullName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    userContextEmail: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "content_fragment",
    sequelize: front_sequelize,
  }
);

User.hasMany(ContentFragment, {
  foreignKey: { name: "userId", allowNull: true }, // null = ContentFragment is not associated with a user
});
ContentFragment.belongsTo(User, {
  foreignKey: { name: "userId", allowNull: true },
});

export class Message extends Model<
  InferAttributes<Message>,
  InferCreationAttributes<Message>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;

  declare version: CreationOptional<number>;
  declare rank: number;
  declare visibility: CreationOptional<MessageVisibility>;

  declare conversationId: ForeignKey<Conversation["id"]>;

  declare parentId: ForeignKey<Message["id"]> | null;
  declare userMessageId: ForeignKey<UserMessage["id"]> | null;
  declare agentMessageId: ForeignKey<AgentMessage["id"]> | null;
  declare contentFragmentId: ForeignKey<ContentFragment["id"]> | null;

  declare userMessage?: NonAttribute<UserMessage>;
  declare agentMessage?: NonAttribute<AgentMessage>;
  declare contentFragment?: NonAttribute<ContentFragment>;
  declare reactions?: NonAttribute<MessageReaction[]>;
}

Message.init(
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
    sequelize: front_sequelize,
    indexes: [
      {
        unique: true,
        fields: ["sId"],
      },
      {
        unique: true,
        fields: ["conversationId", "rank", "version"],
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

Conversation.hasMany(Message, {
  foreignKey: { name: "conversationId", allowNull: false },
  onDelete: "CASCADE",
});
Message.belongsTo(Conversation, {
  as: "conversation",
  foreignKey: { name: "conversationId", allowNull: false },
});

UserMessage.hasOne(Message, {
  as: "userMessage",
  foreignKey: { name: "userMessageId", allowNull: true },
});
Message.belongsTo(UserMessage, {
  as: "userMessage",
  foreignKey: { name: "userMessageId", allowNull: true },
});

AgentMessage.hasOne(Message, {
  as: "agentMessage",
  foreignKey: { name: "agentMessageId", allowNull: true },
});
Message.belongsTo(AgentMessage, {
  as: "agentMessage",
  foreignKey: { name: "agentMessageId", allowNull: true },
});

Message.belongsTo(Message, {
  foreignKey: { name: "parentId", allowNull: true },
});
ContentFragment.hasOne(Message, {
  as: "contentFragment",
  foreignKey: { name: "contentFragmentId", allowNull: true },
});
Message.belongsTo(ContentFragment, {
  as: "contentFragment",
  foreignKey: { name: "contentFragmentId", allowNull: true },
});

export class MessageReaction extends Model<
  InferAttributes<MessageReaction>,
  InferCreationAttributes<MessageReaction>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare messageId: ForeignKey<Message["id"]>;

  // User is nullable so that we can store reactions from a Slackbot message
  declare userId: ForeignKey<User["id"]> | null;
  declare userContextUsername: string;
  declare userContextFullName: string | null;

  declare reaction: string;
}

MessageReaction.init(
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
    sequelize: front_sequelize,
    indexes: [
      {
        unique: true,
        fields: ["messageId", "reaction", "userContextUsername"], // Not perfect as that means that a user and slack user with the same username can't react with the same emoji, but that's an edge case.
      },
      { fields: ["messageId"] },
    ],
  }
);

Message.hasMany(MessageReaction, {
  as: "reactions",
  foreignKey: { name: "messageId", allowNull: false },
  onDelete: "CASCADE",
});
MessageReaction.belongsTo(Message, {
  foreignKey: { name: "messageId", allowNull: false },
});
User.hasMany(MessageReaction, {
  foreignKey: { name: "userId", allowNull: true }, // null = mention is from a user using a Slackbot
});
MessageReaction.belongsTo(User, {
  foreignKey: { name: "userId", allowNull: true }, // null = mention is not a user using a Slackbot
});

export class Mention extends Model<
  InferAttributes<Mention>,
  InferCreationAttributes<Mention>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare messageId: ForeignKey<Message["id"]>;
  declare userId: ForeignKey<User["id"]> | null;
  declare agentConfigurationId: string | null; // Not a relation as global agents are not in the DB

  declare user?: NonAttribute<User>;
}

Mention.init(
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
    agentConfigurationId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "mention",
    sequelize: front_sequelize,
    indexes: [
      {
        fields: ["messageId"],
      },
    ],
  }
);

Message.hasMany(Mention, {
  foreignKey: { name: "messageId", allowNull: false },
  onDelete: "CASCADE",
});
Mention.belongsTo(Message, {
  foreignKey: { name: "messageId", allowNull: false },
});

User.hasMany(Mention, {
  foreignKey: { name: "userId", allowNull: true }, // null = mention is not a user mention
});
Mention.belongsTo(User, {
  foreignKey: { name: "userId", allowNull: true }, // null = mention is not a user mention
});
