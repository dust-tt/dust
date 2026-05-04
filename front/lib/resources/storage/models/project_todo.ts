import { ConversationModel } from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type {
  AgentSuggestionStatus,
  ProjectTodoActorType,
  ProjectTodoSourceType,
  ProjectTodoStatus,
} from "@app/types/project_todo";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

// ── Shared attributes ───────────────────────────────────────────────────────
// Used by both the main table and the version snapshot table so that
// ProjectTodoVersionModel can extend ProjectTodoModel without duplicating
// column definitions (same pattern as SkillVersionModel).

const PROJECT_TODO_MODEL_ATTRIBUTES = {
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
    allowNull: true,
    comment:
      "Owner of the todo — null when the todo is not assigned to a specific user.",
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
    comment: "sId of the agent configuration when markedAsDoneByType is agent.",
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: "Category of the todo: to_do, to_know.",
  },
  text: {
    type: DataTypes.TEXT,
    allowNull: false,
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
  agentInstructions: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment:
      "Optional kickoff instructions for the agent when this todo is started.",
  },
  deletedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
  },
  agentSuggestionStatus: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
  },
  agentSuggestionReviewedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
  },
  agentSuggestionReviewedByUserId: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
} as const;

// ── Main model ──────────────────────────────────────────────────────────────
// One row per logical todo. The row's `id` is the stable identity used as a
// foreign key in ProjectTodoVersionModel and all join tables.

export class ProjectTodoModel extends WorkspaceAwareModel<ProjectTodoModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare spaceId: ForeignKey<SpaceModel["id"]>;

  // Owner
  declare userId: ForeignKey<UserModel["id"]> | null;

  // Creator — user or agent (mutually exclusive FKs).
  declare createdByType: ProjectTodoActorType;
  declare createdByUserId: ForeignKey<UserModel["id"]> | null;
  declare createdByAgentConfigurationId: string | null;

  // Done-by — same polymorphic pattern as creator.
  declare markedAsDoneByType: ProjectTodoActorType | null;
  declare markedAsDoneByUserId: ForeignKey<UserModel["id"]> | null;
  declare markedAsDoneByAgentConfigurationId: string | null;

  declare category: "to_do";
  declare text: string;
  declare status: ProjectTodoStatus;
  declare doneAt: Date | null;
  declare actorRationale: string | null;
  declare agentInstructions: string | null;
  declare deletedAt: CreationOptional<Date | null>;
  declare agentSuggestionStatus: AgentSuggestionStatus | null;
  declare agentSuggestionReviewedAt: Date | null;
  declare agentSuggestionReviewedByUserId: ForeignKey<UserModel["id"]> | null;

  declare space: NonAttribute<SpaceModel>;
  declare user: NonAttribute<UserModel | null>;
  declare createdByUser: NonAttribute<UserModel | null>;
  declare markedAsDoneByUser: NonAttribute<UserModel | null>;
}

ProjectTodoModel.init(
  {
    ...PROJECT_TODO_MODEL_ATTRIBUTES,
  },
  {
    modelName: "project_todo",
    sequelize: frontSequelize,
    indexes: [
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

// ── Version model ────────────────────────────────────────────────────────────
// Each save of a logical todo appends a new row here before overwriting the
// main row, preserving the full history. The `projectTodoId` FK is the stable
// reference back to the logical todo's identity.

export class ProjectTodoVersionModel extends ProjectTodoModel {
  declare projectTodoId: ForeignKey<ProjectTodoModel["id"]>;
  declare version: number;
}

ProjectTodoVersionModel.init(
  {
    ...PROJECT_TODO_MODEL_ATTRIBUTES,
    projectTodoId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "Monotonically increasing per projectTodoId.",
    },
  },
  {
    modelName: "project_todo_version",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "project_todo_versions_ws_todo_version_unique_idx",
        fields: ["workspaceId", "projectTodoId", "version"],
        unique: true,
        concurrently: true,
      },
    ],
  }
);

ProjectTodoVersionModel.belongsTo(ProjectTodoModel, {
  foreignKey: { name: "projectTodoId", allowNull: false },
  onDelete: "RESTRICT",
  as: "projectTodo",
});

ProjectTodoModel.hasMany(ProjectTodoVersionModel, {
  foreignKey: { name: "projectTodoId", allowNull: false },
  as: "versions",
});

ProjectTodoModel.belongsTo(SpaceModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  onDelete: "RESTRICT",
  as: "space",
});

ProjectTodoModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: true },
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

ProjectTodoModel.belongsTo(UserModel, {
  foreignKey: {
    name: "agentSuggestionReviewedByUserId",
    allowNull: true,
  },
  onDelete: "RESTRICT",
  as: "agentSuggestionReviewedByUser",
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
  // sId of the takeaway item that produced this link. At most one row per
  // (workspaceId, itemId) — if the same item reappears later the row is
  // upserted, not duplicated.
  declare itemId: string;
  declare sourceType: ProjectTodoSourceType;
  declare sourceId: string;
  declare sourceTitle: string | null;
  declare sourceUrl: string | null;

  declare projectTodo: NonAttribute<ProjectTodoModel>;
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
    itemId: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "sId of the takeaway item that produced this source link.",
    },
    sourceType: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Type of content node that led to creating this todo.",
    },
    sourceId: {
      type: DataTypes.STRING,
      allowNull: false,
      comment:
        "String identifier of the source (conversation sId, external URL/ID, etc.) that led to creating this todo.",
    },
    sourceTitle: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    sourceUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
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
        name: "project_todo_sources_sourceType_sourceId_idx",
        fields: ["sourceType", "sourceId"],
        concurrently: true,
      },
      {
        name: "project_todo_sources_ws_todo_source_unique_idx",
        fields: ["workspaceId", "projectTodoId", "sourceType", "sourceId"],
        unique: true,
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
