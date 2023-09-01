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
import { Workspace } from "@app/lib/models/workspace";
import { ChatSessionVisibility, MessageFeedbackStatus } from "@app/types/chat";

export class ChatSession extends Model<
  InferAttributes<ChatSession>,
  InferCreationAttributes<ChatSession>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;
  declare title: string | null;
  declare visibility: ChatSessionVisibility;

  declare workspaceId: ForeignKey<Workspace["id"]> | null;
  declare userId: ForeignKey<User["id"]> | null;
}

ChatSession.init(
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
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "private",
    },
  },
  {
    modelName: "chat_session",
    sequelize: front_sequelize,
    indexes: [
      { unique: true, fields: ["sId"] },
      { fields: ["workspaceId", "userId"] },
      { fields: ["workspaceId", "sId"] },
    ],
  }
);

Workspace.hasMany(ChatSession);
User.hasMany(ChatSession);

export class ChatMessage extends Model<
  InferAttributes<ChatMessage>,
  InferCreationAttributes<ChatMessage>
> {
  declare id: CreationOptional<number>;
  declare sId: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare feedback: MessageFeedbackStatus;
  declare role: "user" | "retrieval" | "assistant" | "error";
  declare message: string | null;
  // `retrievals` are stored in a separate table
  declare chatSessionId: ForeignKey<ChatSession["id"]> | null;
}

ChatMessage.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    sId: {
      type: DataTypes.STRING,
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
    role: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    feedback: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "chat_message",
    sequelize: front_sequelize,
    indexes: [
      { unique: true, fields: ["sId"] },
      { fields: ["chatSessionId", "createdAt"] },
    ],
  }
);

ChatSession.hasMany(ChatMessage, { onDelete: "CASCADE" });

export class ChatRetrievedDocument extends Model<
  InferAttributes<ChatRetrievedDocument>,
  InferCreationAttributes<ChatRetrievedDocument>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare dataSourceId: string;
  declare sourceUrl: string | null;
  declare documentId: string;
  declare timestamp: string;
  declare tags: string[];
  declare score: number;
  // `chunks` are not stored for Chat history

  declare chatMessageId: ForeignKey<ChatMessage["id"]> | null;
}

ChatRetrievedDocument.init(
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
    dataSourceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sourceUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    documentId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    timestamp: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
    },
    score: {
      type: DataTypes.REAL,
      allowNull: false,
    },
  },
  {
    modelName: "chat_retrieved_document",
    sequelize: front_sequelize,
    indexes: [{ fields: ["chatMessageId"] }],
  }
);

ChatMessage.hasMany(ChatRetrievedDocument, {
  onDelete: "CASCADE",
});
