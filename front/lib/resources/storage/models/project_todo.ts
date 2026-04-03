import { ConversationModel } from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type {
  ProjectTodoActorType,
  ProjectTodoCategory,
  ProjectTodoSourceType,
  ProjectTodoStatus,
} from "@app/types/project_todo";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

// ── Main model ──────────────────────────────────────────────────────────────

export class ProjectTodoModel extends WorkspaceAwareModel<ProjectTodoModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare spaceId: ForeignKey<SpaceModel["id"]>;

  // Owner
  declare userId: ForeignKey<UserModel["id"]>;

  // Creator — user or agent (mutually exclusive FKs).
  declare createdByType: ProjectTodoActorType;
  declare createdByUserId: ForeignKey<UserModel["id"]> | null;
  declare createdByAgentConfigurationId: string | null;

  // Done-by — same polymorphic pattern as creator.
  declare markedAsDoneByType: ProjectTodoActorType | null;
  declare markedAsDoneByUserId: ForeignKey<UserModel["id"]> | null;
  declare markedAsDoneByAgentConfigurationId: string | null;

  // Stable identity: same sId across all version rows of one logical todo.
  declare sId: string;

  declare category: ProjectTodoCategory;
  declare text: string;
  declare version: number;
  declare status: ProjectTodoStatus;
  declare doneAt: Date | null;
  declare actorRationale: string | null;

  declare space: NonAttribute<SpaceModel>;
  declare user: NonAttribute<UserModel>;
  declare createdByUser: NonAttribute<UserModel | null>;
  declare markedAsDoneByUser: NonAttribute<UserModel | null>;
}

ProjectTodoModel.init(
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
    spaceId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    userId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      comment: "Owner of the todo — a todo is always assigned to a user.",
    },
    createdByUserId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      comment: "Set when createdByType is user.",
    },
    createdByType: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Actor type that created this todo: user or agent.",
    },
    createdByAgentConfigurationId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "sId of the agent configuration when createdByType is agent.",
    },
    markedAsDoneByType: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Actor type that completed this todo: user or agent.",
    },
    markedAsDoneByUserId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      comment: "Set when markedAsDoneByType is user.",
    },
    markedAsDoneByAgentConfigurationId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment:
        "sId of the agent configuration when markedAsDoneByType is agent.",
    },
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
      comment:
        "Stable identifier shared across all version rows of the same logical todo.",
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
      comment:
        "Category of the todo: need_attention, key_decisions, follow_ups, notable_updates.",
    },
    text: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: "Version number for diff handling.",
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "todo",
    },
    doneAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    actorRationale: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Explanation for why the actor made a change.",
    },
  },
  {
    modelName: "project_todo",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "project_todos_sId_version_unique_idx",
        fields: ["workspaceId", "sId", "version"],
        unique: true,
        concurrently: true,
      },
      {
        name: "project_todos_sId_idx",
        fields: ["sId"],
        concurrently: true,
      },
      {
        name: "project_todos_ws_space_user_version_idx",
        fields: ["workspaceId", "spaceId", "userId", "version"],
        concurrently: true,
      },
      {
        name: "project_todos_ws_space_user_idx",
        fields: ["workspaceId", "spaceId", "userId"],
        concurrently: true,
      },
      {
        name: "project_todos_spaceId_idx",
        fields: ["spaceId"],
        concurrently: true,
      },
      {
        name: "project_todos_userId_idx",
        fields: ["userId"],
        concurrently: true,
      },
      {
        name: "project_todos_createdByUserId_idx",
        fields: ["createdByUserId"],
        concurrently: true,
      },
      {
        name: "project_todos_markedAsDoneByUserId_idx",
        fields: ["markedAsDoneByUserId"],
        concurrently: true,
      },
    ],
    validate: {
      createdByXor() {
        const hasUser = this.createdByUserId !== null;
        const hasAgent = this.createdByAgentConfigurationId !== null;

        if (this.createdByType === "user" && (!hasUser || hasAgent)) {
          throw new Error(
            "createdByType is user: createdByUserId must be set and createdByAgentConfigurationId must be null."
          );
        }
        if (this.createdByType === "agent" && (hasUser || !hasAgent)) {
          throw new Error(
            "createdByType is agent: createdByAgentConfigurationId must be set and createdByUserId must be null."
          );
        }
      },
      markedAsDoneByXor() {
        const hasType = this.markedAsDoneByType !== null;
        const hasUser = this.markedAsDoneByUserId !== null;
        const hasAgent = this.markedAsDoneByAgentConfigurationId !== null;

        if (!hasType && (hasUser || hasAgent)) {
          throw new Error(
            "markedAsDoneByType is null: markedAsDoneByUserId and markedAsDoneByAgentConfigurationId must both be null."
          );
        }
        if (this.markedAsDoneByType === "user" && (!hasUser || hasAgent)) {
          throw new Error(
            "markedAsDoneByType is user: markedAsDoneByUserId must be set and markedAsDoneByAgentConfigurationId must be null."
          );
        }
        if (this.markedAsDoneByType === "agent" && (hasUser || !hasAgent)) {
          throw new Error(
            "markedAsDoneByType is agent: markedAsDoneByAgentConfigurationId must be set and markedAsDoneByUserId must be null."
          );
        }
      },
    },
  }
);

ProjectTodoModel.belongsTo(SpaceModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  onDelete: "RESTRICT",
  as: "space",
});

ProjectTodoModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
  as: "user",
});

ProjectTodoModel.belongsTo(UserModel, {
  foreignKey: { name: "createdByUserId", allowNull: true },
  onDelete: "RESTRICT",
  as: "createdByUser",
});

ProjectTodoModel.belongsTo(UserModel, {
  foreignKey: { name: "markedAsDoneByUserId", allowNull: true },
  onDelete: "RESTRICT",
  as: "markedAsDoneByUser",
});

// ── Join table: ProjectTodo → Conversation (output direction only) ──────────
// Tracks conversations that were created *because of* a todo.

export class ProjectTodoConversationModel extends WorkspaceAwareModel<ProjectTodoConversationModel> {
  declare createdAt: CreationOptional<Date>;

  declare projectTodoId: ForeignKey<ProjectTodoModel["id"]>;
  declare conversationId: ForeignKey<ConversationModel["id"]>;

  declare projectTodo: NonAttribute<ProjectTodoModel>;
  declare conversation: NonAttribute<ConversationModel>;
}

ProjectTodoConversationModel.init(
  {
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    projectTodoId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    conversationId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
  },
  {
    modelName: "project_todo_conversation",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "project_todo_conversations_ws_todo_idx",
        fields: ["workspaceId", "projectTodoId"],
        concurrently: true,
      },
      {
        name: "project_todo_conversations_projectTodoId_idx",
        fields: ["projectTodoId"],
        concurrently: true,
      },
      {
        name: "project_todo_conversations_ws_unique_idx",
        fields: ["workspaceId", "projectTodoId", "conversationId"],
        unique: true,
        concurrently: true,
      },
      {
        name: "project_todo_conversations_conversationId_idx",
        fields: ["conversationId"],
        concurrently: true,
      },
    ],
  }
);

ProjectTodoConversationModel.belongsTo(ProjectTodoModel, {
  foreignKey: { name: "projectTodoId", allowNull: false },
  onDelete: "RESTRICT",
  as: "projectTodo",
});

ProjectTodoModel.hasMany(ProjectTodoConversationModel, {
  foreignKey: { name: "projectTodoId", allowNull: false },
  as: "conversations",
});

ProjectTodoConversationModel.belongsTo(ConversationModel, {
  foreignKey: { name: "conversationId", allowNull: false },
  onDelete: "RESTRICT",
  as: "conversation",
});

// ── Source table: * → ProjectTodo ───────────────────────────────────────────
// Tracks content nodes (conversations, slack messages, etc.) that *led to*
// creating a todo.

export class ProjectTodoSourceModel extends WorkspaceAwareModel<ProjectTodoSourceModel> {
  declare createdAt: CreationOptional<Date>;

  declare projectTodoId: ForeignKey<ProjectTodoModel["id"]>;
  declare sourceType: ProjectTodoSourceType;
  declare sourceConversationId: ForeignKey<ConversationModel["id"]> | null;

  // Stable sId of the conversation_todo_versioned item (actionItem, keyDecision, or notableFact)
  // that generated this project_todo. Used by the merge workflow for idempotent upserts.
  declare conversationTodoItemSId: string | null;

  declare projectTodo: NonAttribute<ProjectTodoModel>;
  declare sourceConversation: NonAttribute<ConversationModel | null>;
}

ProjectTodoSourceModel.init(
  {
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    projectTodoId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    sourceType: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Type of content node that led to creating this todo.",
    },
    sourceConversationId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      comment: "Set when sourceType is conversation.",
    },
    conversationTodoItemSId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment:
        "Stable sId of the conversation_todo_versioned item that generated this project_todo. " +
        "Used by the merge workflow to idempotently match existing project_todos to their source items.",
    },
  },
  {
    modelName: "project_todo_source",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "project_todo_sources_ws_todo_idx",
        fields: ["workspaceId", "projectTodoId"],
        concurrently: true,
      },
      {
        name: "project_todo_sources_projectTodoId_idx",
        fields: ["projectTodoId"],
        concurrently: true,
      },
      {
        name: "project_todo_sources_sourceConversationId_idx",
        fields: ["sourceConversationId"],
        concurrently: true,
      },
      {
        name: "project_todo_sources_conversation_item_sId_idx",
        fields: ["sourceConversationId", "conversationTodoItemSId"],
        concurrently: true,
      },
    ],
  }
);

ProjectTodoSourceModel.belongsTo(ProjectTodoModel, {
  foreignKey: { name: "projectTodoId", allowNull: false },
  onDelete: "RESTRICT",
  as: "projectTodo",
});

ProjectTodoModel.hasMany(ProjectTodoSourceModel, {
  foreignKey: { name: "projectTodoId", allowNull: false },
  as: "sources",
});

ProjectTodoSourceModel.belongsTo(ConversationModel, {
  foreignKey: { name: "sourceConversationId", allowNull: true },
  onDelete: "RESTRICT",
  as: "sourceConversation",
});
