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
import { ChatSessionVisibility } from "@app/types/chat";

export class AssistantConversation extends Model<
  InferAttributes<AssistantConversation>,
  InferCreationAttributes<AssistantConversation>
> {
  declare id: number;
  declare sId: string;
  declare title: string | null;
  declare created: Date;
  declare visibility: ChatSessionVisibility;
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

AssistantUserMessage.belongsTo(User, { foreignKey: "userId" });
User.hasMany(AssistantUserMessage, { foreignKey: "userId" });

export class AssistantAgentMessage extends Model<
  InferAttributes<AssistantAgentMessage>,
  InferCreationAttributes<AssistantAgentMessage>
> {
  declare id: number;
  declare message: string | null;
}

AssistantAgentMessage.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    message: {
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
  declare status: CreationOptional<"visible" | "deleted">;

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
    status: {
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

AssistantMessage.belongsTo(AssistantConversation, {
  foreignKey: "assistantConversationId",
  onDelete: "CASCADE",
});
AssistantConversation.hasMany(AssistantMessage, {
  foreignKey: "assistantAgentMessageId",
});
AssistantUserMessage.hasOne(AssistantMessage, {
  foreignKey: "assistantUserMessageId",
  sourceKey: "id",
  onDelete: "RESTRICT",
});
AssistantMessage.belongsTo(AssistantUserMessage, {
  foreignKey: "assistantUserMessageId",
});
AssistantAgentMessage.hasOne(AssistantMessage, {
  foreignKey: "assistantAgentMessageId",
  sourceKey: "id",
  onDelete: "RESTRICT",
});
AssistantMessage.belongsTo(AssistantAgentMessage, {
  foreignKey: "assistantAgentMessageId",
});
AssistantMessage.belongsTo(AssistantMessage, {
  foreignKey: "parentId",
  as: "parent",
});
AssistantMessage.hasMany(AssistantMessage, {
  foreignKey: "parentId",
  as: "children",
});
