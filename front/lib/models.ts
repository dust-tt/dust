import {
  CreationOptional,
  DataTypes,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

import { MessageFeedbackStatus } from "@app/types/chat";

import { ConnectorProvider } from "./connectors_api";

const { FRONT_DATABASE_URI } = process.env;

export const front_sequelize = new Sequelize(FRONT_DATABASE_URI as string, {
  logging: false,
}); // TODO: type process.env

export class User extends Model<
  InferAttributes<User>,
  InferCreationAttributes<User>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare provider: "github" | "google";
  declare providerId: string;
  declare username: string;
  declare email: string;
  declare name: string;
}
User.init(
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
    provider: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    providerId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "user",
    sequelize: front_sequelize,
    indexes: [{ fields: ["username"] }, { fields: ["provider", "providerId"] }],
  }
);

export class UserMetadata extends Model<
  InferAttributes<UserMetadata>,
  InferCreationAttributes<UserMetadata>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare key: string;
  declare value: string;
  declare userId: ForeignKey<User["id"]>;
}
UserMetadata.init(
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
    key: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    modelName: "user_metadata",
    sequelize: front_sequelize,
    indexes: [{ fields: ["userId", "key"], unique: true }],
  }
);
User.hasMany(UserMetadata, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});

export class Workspace extends Model<
  InferAttributes<Workspace>,
  InferCreationAttributes<Workspace>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare uId: string;
  declare sId: string;
  declare name: string;
  declare description?: string;
  declare allowedDomain?: string;
  declare plan?: string;
}
Workspace.init(
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
    uId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
    },
    allowedDomain: {
      type: DataTypes.STRING,
    },
    plan: {
      type: DataTypes.STRING,
    },
  },
  {
    modelName: "workspace",
    sequelize: front_sequelize,
    indexes: [{ unique: true, fields: ["sId"] }],
  }
);

export class Membership extends Model<
  InferAttributes<Membership>,
  InferCreationAttributes<Membership>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare role: "admin" | "builder" | "user" | "revoked";

  declare userId: ForeignKey<User["id"]>;
  declare workspaceId: ForeignKey<Workspace["id"]>;
}
Membership.init(
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
    role: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "membership",
    sequelize: front_sequelize,
    indexes: [{ fields: ["userId", "role"] }],
  }
);
User.hasMany(Membership);
Workspace.hasMany(Membership);

export class MembershipInvitation extends Model<
  InferAttributes<MembershipInvitation>,
  InferCreationAttributes<MembershipInvitation>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare inviteEmail: "string";
  declare status: "pending" | "consumed" | "revoked";

  declare workspaceId: ForeignKey<Workspace["id"]>;
  declare invitedUserId: ForeignKey<User["id"]>;
}
MembershipInvitation.init(
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
    inviteEmail: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "pending",
    },
    invitedUserId: {
      type: DataTypes.INTEGER,
      references: {
        model: "users",
        key: "id",
      },
    },
  },
  {
    modelName: "membership_invitation",
    sequelize: front_sequelize,
    indexes: [{ fields: ["workspaceId", "status"] }],
  }
);
Workspace.hasMany(MembershipInvitation);
User.hasMany(MembershipInvitation, {
  foreignKey: "invitedUserId",
});

export class App extends Model<
  InferAttributes<App>,
  InferCreationAttributes<App>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare uId: string;
  declare sId: string;
  declare name: string;
  declare description?: string;
  declare visibility: "public" | "private" | "unlisted" | "deleted";
  declare savedSpecification?: string;
  declare savedConfig?: string;
  declare savedRun?: string;
  declare dustAPIProjectId: string;

  declare workspaceId: ForeignKey<Workspace["id"]>;
}
App.init(
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
    uId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
    },
    visibility: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    savedSpecification: {
      type: DataTypes.TEXT,
    },
    savedConfig: {
      type: DataTypes.TEXT,
    },
    savedRun: {
      type: DataTypes.TEXT,
    },
    dustAPIProjectId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "app",
    sequelize: front_sequelize,
    indexes: [
      { unique: true, fields: ["sId"] },
      { fields: ["workspaceId", "visibility"] },
      { fields: ["workspaceId", "sId", "visibility"] },
    ],
  }
);
Workspace.hasMany(App);

export class Provider extends Model<
  InferAttributes<Provider>,
  InferCreationAttributes<Provider>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare providerId: string;
  declare config: string;

  declare workspaceId: ForeignKey<Workspace["id"]>;
}
Provider.init(
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
    providerId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    config: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    modelName: "provider",
    sequelize: front_sequelize,
    indexes: [{ fields: ["workspaceId"] }],
  }
);
Workspace.hasMany(Provider);

export class Dataset extends Model<
  InferAttributes<Dataset>,
  InferCreationAttributes<Dataset>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: string;
  declare description?: string;

  declare workspaceId: ForeignKey<Workspace["id"]>;
  declare appId: ForeignKey<App["id"]>;
}
Dataset.init(
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
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
    },
  },
  {
    modelName: "dataset",
    sequelize: front_sequelize,
    indexes: [{ fields: ["workspaceId", "appId", "name"] }],
  }
);
App.hasMany(Dataset);
Workspace.hasMany(Dataset);

export class Clone extends Model<
  InferAttributes<Clone>,
  InferCreationAttributes<Clone>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare fromId: ForeignKey<App["id"]>;
  declare toId: ForeignKey<App["id"]>;
}
Clone.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
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
    fromId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "apps",
        key: "id",
      },
    },
    toId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "apps",
        key: "id",
      },
    },
  },
  {
    modelName: "clone",
    sequelize: front_sequelize,
  }
);
Clone.belongsTo(App, { foreignKey: "fromId" });
Clone.belongsTo(App, { foreignKey: "toId" });

export class Key extends Model<
  InferAttributes<Key>,
  InferCreationAttributes<Key>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare secret: string;
  declare status: "active" | "disabled";
  declare isSystem: boolean;

  declare workspaceId: ForeignKey<Workspace["id"]>;
}
Key.init(
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
    secret: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    isSystem: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
  },
  {
    modelName: "keys",
    sequelize: front_sequelize,
    indexes: [
      { unique: true, fields: ["secret"] },
      { fields: ["workspaceId"] },
    ],
  }
);
Workspace.hasMany(Key);

export class DataSource extends Model<
  InferAttributes<DataSource>,
  InferCreationAttributes<DataSource>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: string;
  declare description?: string;
  declare visibility: "public" | "private";
  declare config?: string;
  declare dustAPIProjectId: string;
  declare connectorId?: string;
  declare connectorProvider?: ConnectorProvider;
  declare userUpsertable: CreationOptional<boolean>;
  declare workspaceId: ForeignKey<Workspace["id"]>;
}

DataSource.init(
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
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
    },
    visibility: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    config: {
      type: DataTypes.TEXT,
    },
    dustAPIProjectId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    connectorId: {
      type: DataTypes.STRING,
    },
    connectorProvider: {
      type: DataTypes.STRING,
    },
    userUpsertable: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
  },
  {
    modelName: "data_source",
    sequelize: front_sequelize,
    indexes: [
      { fields: ["workspaceId", "visibility"] },
      { fields: ["workspaceId", "name", "visibility"] },
      { fields: ["workspaceId", "name"], unique: true },
    ],
  }
);
Workspace.hasMany(DataSource);

export class Run extends Model<
  InferAttributes<Run>,
  InferCreationAttributes<Run>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare dustRunId: string;
  declare runType: string;

  declare appId: ForeignKey<App["id"]>;
  declare workspaceId: ForeignKey<Workspace["id"]>;
}

Run.init(
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
    dustRunId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    runType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "run",
    sequelize: front_sequelize,
    indexes: [
      { fields: ["workspaceId", "appId", "runType", "createdAt"] },
      { unique: true, fields: ["dustRunId"] },
    ],
  }
);
App.hasMany(Run);
Workspace.hasMany(Run);

// Chat

export class ChatSession extends Model<
  InferAttributes<ChatSession>,
  InferCreationAttributes<ChatSession>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;
  declare title?: string;

  declare workspaceId: ForeignKey<Workspace["id"]>;
  declare userId: ForeignKey<User["id"]>;
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
  declare message?: string;
  // `retrievals` are stored in a separate table
  declare chatSessionId: ForeignKey<ChatSession["id"]>;
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

ChatSession.hasMany(ChatMessage);

export class ChatRetrievedDocument extends Model<
  InferAttributes<ChatRetrievedDocument>,
  InferCreationAttributes<ChatRetrievedDocument>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare dataSourceId: string;
  declare sourceUrl: string;
  declare documentId: string;
  declare timestamp: string;
  declare tags: string[];
  declare score: number;
  // `chunks` are not stored for Chat history

  declare chatMessageId: ForeignKey<ChatMessage["id"]>;
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
      allowNull: false,
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

ChatMessage.hasMany(ChatRetrievedDocument);

export class GensTemplate extends Model<
  InferAttributes<GensTemplate>,
  InferCreationAttributes<GensTemplate>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare workspaceId: ForeignKey<Workspace["id"]>;
  declare userId: ForeignKey<User["id"]>;
  declare instructions: string[];
  declare name: string;
  declare visibility: "user" | "workspace";
  declare color: string;
  declare sId: string;
}

GensTemplate.init(
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
    instructions: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    visibility: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    color: {
      type: DataTypes.STRING,
    },
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "gens_template",
    sequelize: front_sequelize,
    indexes: [{ fields: ["workspaceId", "sId"], unique: true }],
  }
);

User.hasMany(GensTemplate);
Workspace.hasMany(GensTemplate);

export class TrackedDocument extends Model<
  InferAttributes<TrackedDocument>,
  InferCreationAttributes<TrackedDocument>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare documentId: string;
  declare trackingEnabledAt: Date | null;

  declare userId: ForeignKey<User["id"]>;
  declare dataSourceId: ForeignKey<DataSource["id"]>;
}

TrackedDocument.init(
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
    documentId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    trackingEnabledAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    modelName: "tracked_document",
    sequelize: front_sequelize,
    indexes: [
      { fields: ["userId", "dataSourceId", "documentId"], unique: true },
      { fields: ["dataSourceId"] },
    ],
  }
);

DataSource.hasMany(TrackedDocument, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
User.hasMany(TrackedDocument, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});

// Events
export class EventSchema extends Model<
  InferAttributes<EventSchema>,
  InferCreationAttributes<EventSchema>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare marker: string;
  declare description?: string;
  declare status: "active" | "disabled";
  declare properties: {
    name: string;
    type: number[] | Date[] | string[];
    description: string;
  }[];
  declare userId: ForeignKey<User["id"]>;
  declare workspaceId: ForeignKey<Workspace["id"]>;
}
EventSchema.init(
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
    marker: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "active",
    },
    properties: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
  },
  {
    modelName: "event_schema",
    sequelize: front_sequelize,
    indexes: [{ fields: ["workspaceId", "marker"], unique: true }],
  }
);
Workspace.hasMany(EventSchema, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
User.hasMany(EventSchema, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});

export class ExtractedEvent extends Model<
  InferAttributes<ExtractedEvent>,
  InferCreationAttributes<ExtractedEvent>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare properties: any;

  declare eventSchemaId: ForeignKey<EventSchema["id"]>;
  declare documentId: string;
}
ExtractedEvent.init(
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
    properties: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    documentId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "extracted_event",
    sequelize: front_sequelize,
    indexes: [{ fields: ["eventSchemaId"] }, { fields: ["documentId"] }],
  }
);
EventSchema.hasMany(ExtractedEvent, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE", // @todo daph define if we really want to delete the extracted event when the schema is deleted
});

// XP1

const { XP1_DATABASE_URI } = process.env;
const xp1_sequelize = new Sequelize(XP1_DATABASE_URI as string, {
  logging: false,
});

export class XP1User extends Model<
  InferAttributes<XP1User>,
  InferCreationAttributes<XP1User>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: string;
  declare email: string;
  declare secret: string;
}

XP1User.init(
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
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    secret: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "user",
    sequelize: xp1_sequelize,
    indexes: [{ fields: ["secret"] }],
  }
);

export class XP1Run extends Model<
  InferAttributes<XP1Run>,
  InferCreationAttributes<XP1Run>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare dustUser: string;
  declare dustAppId: string;
  declare dustRunId: string;
  declare runStatus: string;
  declare promptTokens: number;
  declare completionTokens: number;

  declare userId: ForeignKey<XP1User["id"]>;
}

XP1Run.init(
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
    dustUser: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dustAppId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dustRunId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    runStatus: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    promptTokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    completionTokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    modelName: "run",
    sequelize: xp1_sequelize,
    indexes: [{ fields: ["userId"] }],
  }
);
XP1User.hasMany(XP1Run);
