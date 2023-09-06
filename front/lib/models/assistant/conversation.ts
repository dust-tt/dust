import {
  CreationOptional,
  DataTypes,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";

import { front_sequelize } from "@app/lib/databases";
import { User } from "@app/lib/models/user";
import {
  AgentMessageStatus,
  ConversationVisibility,
  MessageVisibility,
} from "@app/types/assistant/conversation";

export class Conversation extends Model<
  InferAttributes<Conversation>,
  InferCreationAttributes<Conversation>
> {
  declare id: CreationOptional<number>;
  declare sId: string;
  declare title: string | null;
  declare created: Date;
  declare visibility: CreationOptional<ConversationVisibility>;
}

Conversation.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    title: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    created: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    visibility: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "private",
    },
  },
  {
    modelName: "conversation",
    sequelize: front_sequelize,
  }
);

export class UserMessage extends Model<
  InferAttributes<UserMessage>,
  InferCreationAttributes<UserMessage>
> {
  declare id: CreationOptional<number>;

  declare message: string;

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
    message: {
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
  foreignKey: { name: "userId" },
});

export class AgentMessage extends Model<
  InferAttributes<AgentMessage>,
  InferCreationAttributes<AgentMessage>
> {
  declare id: CreationOptional<number>;

  declare status: CreationOptional<AgentMessageStatus>;

  declare message: string | null;
  declare errorCode: string | null;
  declare errorMessage: string | null;
}

AgentMessage.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "created",
    },
    message: {
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
  },
  {
    modelName: "agent_message",
    sequelize: front_sequelize,
  }
);

export class Message extends Model<
  InferAttributes<Message>,
  InferCreationAttributes<Message>
> {
  declare id: CreationOptional<number>;
  declare sId: string;

  declare version: CreationOptional<number>;
  declare rank: number;
  declare visibility: CreationOptional<MessageVisibility>;

  declare conversationId: ForeignKey<Conversation["id"]>;

  declare parentId: ForeignKey<Message["id"]> | null;
  declare userMessageId: ForeignKey<UserMessage["id"]> | null;
  declare agentMessageId: ForeignKey<AgentMessage["id"]> | null;
}

Message.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
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
        fields: ["version", "conversationId", "rank"],
      },
    ],
    hooks: {
      beforeValidate: (message) => {
        if (!message.userMessageId === !message.agentMessageId) {
          throw new Error(
            "Exactly one of userMessageId, agentMessageId must be non-null"
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
UserMessage.hasOne(Message, {
  foreignKey: "userMessageId",
  as: "_message",
});
AgentMessage.hasOne(Message, {
  foreignKey: "agentMessageId",
  as: "_message",
});
Message.belongsTo(Message, {
  foreignKey: "parentId",
});
