import { ConversationModel } from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type {
  TodoSnapshotActionItem,
  TodoSnapshotAgentSuggestion,
  TodoSnapshotKeyDecision,
  TodoSnapshotNotableFact,
} from "@app/types/conversation_todo_snapshot";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

export class ConversationTodoSnapshotModel extends WorkspaceAwareModel<ConversationTodoSnapshotModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare conversationId: ForeignKey<ConversationModel["id"]>;

  // Versioning: each butler run appends a new row. Version is monotonically
  // increasing per conversation, starting at 1.
  declare version: number;

  // UUID identifying the butler run that produced this snapshot, for log
  // correlation.
  declare runId: string;

  // Rolling state — full replacement on each run.
  declare topic: string | null;
  declare actionItems: TodoSnapshotActionItem[];
  declare notableFacts: TodoSnapshotNotableFact[];
  declare keyDecisions: TodoSnapshotKeyDecision[];
  declare agentSuggestions: TodoSnapshotAgentSuggestion[];

  // Run tracking.
  declare lastRunAt: Date;
  declare lastProcessedMessageRank: number;

  declare conversation: NonAttribute<ConversationModel>;
}

ConversationTodoSnapshotModel.init(
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
    conversationId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment:
        "Monotonically increasing per conversation. Each butler run inserts a new row rather than overwriting.",
    },
    runId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment:
        "UUID of the butler run that produced this snapshot, for log correlation.",
    },
    topic: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment:
        "One-line summary of the conversation topic, e.g. 'Debugging the embed timeout issue'.",
    },
    actionItems: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      comment:
        "Detected action items with assignee, status, and source message rank.",
    },
    notableFacts: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      comment: "Notable facts extracted from the conversation.",
    },
    keyDecisions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      comment: "Key decisions made during the conversation.",
    },
    agentSuggestions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      comment: "Agents suggested to invoke based on conversation content.",
    },
    lastRunAt: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: "Timestamp of when this butler run was executed.",
    },
    lastProcessedMessageRank: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment:
        "Rank of the last message processed in this run. Used to skip already-seen messages on the next run.",
    },
  },
  {
    modelName: "conversation_todo_snapshot",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "conversation_todo_snapshots_ws_conv_version_unique_idx",
        fields: ["workspaceId", "conversationId", "version"],
        unique: true,
        concurrently: true,
      },
      {
        name: "conversation_todo_snapshots_ws_conv_idx",
        fields: ["workspaceId", "conversationId"],
        concurrently: true,
      },
      {
        name: "conversation_todo_snapshots_conversationId_idx",
        fields: ["conversationId"],
        concurrently: true,
      },
    ],
  }
);

ConversationTodoSnapshotModel.belongsTo(ConversationModel, {
  foreignKey: { name: "conversationId", allowNull: false },
  onDelete: "RESTRICT",
  as: "conversation",
});
