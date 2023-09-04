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
  AssistantAgentMessageStatus,
  AssistantConversationVisibility,
  AssistantMessageVisibility,
} from "@app/types/assistant/conversation";

export class AssistantConversation extends Model<
  InferAttributes<AssistantConversation>,
  InferCreationAttributes<AssistantConversation>
> {
  declare id: number;
  declare sId: string;
  declare title: string | null;
  declare created: Date;
  declare visibility: AssistantConversationVisibility;
}

AssistantConversation.init(
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
    modelName: "assistant_conversation",
    sequelize: front_sequelize,
  }
);

export class AssistantUserMessage extends Model<
  InferAttributes<AssistantUserMessage>,
  InferCreationAttributes<AssistantUserMessage>
> {
  declare id: number;
  declare message: string;

  declare userContextUsername: string;
  declare userContextTimezone: string;
  declare userContextFullName: string | null;
  declare userContextEmail: string | null;
  declare userContextProfilePictureUrl: string | null;

  declare userId: ForeignKey<User["id"]>;
}

AssistantUserMessage.init(
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
    modelName: "assistant_user_message",
    sequelize: front_sequelize,
  }
);

User.hasMany(AssistantUserMessage, { foreignKey: "userId" });

export class AssistantAgentMessage extends Model<
  InferAttributes<AssistantAgentMessage>,
  InferCreationAttributes<AssistantAgentMessage>
> {
  declare id: number;

  declare status: CreationOptional<AssistantAgentMessageStatus>;

  declare message: string | null;
  declare errorCode: string | null;
  declare errorMessage: string | null;
}

AssistantAgentMessage.init(
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
    modelName: "assistant_agent_message",
    sequelize: front_sequelize,
  }
);

export class AssistantMessage extends Model<
  InferAttributes<AssistantMessage>,
  InferCreationAttributes<AssistantMessage>
> {
  declare id: number;
  declare sId: string;

  declare version: number;
  declare rank: number;
  declare visibility: CreationOptional<AssistantMessageVisibility>;

  declare assistantConversationId: ForeignKey<AssistantConversation["id"]>;
  declare parentId: ForeignKey<AssistantMessage["id"]> | null;
  declare assistantUserMessageId: ForeignKey<AssistantUserMessage["id"]> | null;
  declare assistantAgentMessageId: ForeignKey<
    AssistantAgentMessage["id"]
  > | null;
}

AssistantMessage.init(
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
    modelName: "assistant_message",
    sequelize: front_sequelize,
    indexes: [
      {
        unique: true,
        fields: ["version", "assistantConversationId", "rank"],
      },
    ],
    hooks: {
      // TODO @fontanierh: check if we want to add a Check Constraint (from db.ts ?)
      beforeValidate: (message) => {
        if (
          (message.assistantUserMessageId === null) ===
          (message.assistantAgentMessageId === null)
        ) {
          throw new Error(
            "Exactly one of assistantUserMessageId, assistantAgentMessageId must be non-null"
          );
        }
      },
    },
  }
);
AssistantConversation.hasMany(AssistantMessage, {
  foreignKey: "assistantConversationId",
});
AssistantUserMessage.hasOne(AssistantMessage, {
  foreignKey: "assistantUserMessageId",
});
AssistantAgentMessage.hasOne(AssistantMessage, {
  foreignKey: "assistantAgentMessageId",
});
AssistantMessage.belongsTo(AssistantMessage, {
  foreignKey: "parentId",
});
