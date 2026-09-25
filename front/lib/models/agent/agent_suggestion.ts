import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { BatchSuggestionModel } from "@app/lib/models/batch_suggestion";
import { frontSequelize } from "@app/lib/resources/storage";
import {
  DANGEROUSLY_UNBOUNDED_TEXT,
  DataTypes,
  Op,
} from "@app/lib/resources/storage/data_types";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type {
  AgentSuggestionKind,
  AgentSuggestionSource,
  AgentSuggestionState,
  SuggestionPayload,
} from "@app/types/suggestions/agent_suggestion";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";

export class AgentSuggestionModel extends WorkspaceAwareModel<AgentSuggestionModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfigurationId: ForeignKey<AgentConfigurationModel["id"]>;

  declare kind: AgentSuggestionKind;
  declare suggestion: SuggestionPayload;
  declare analysis: string | null;
  declare title: string | null;

  declare state: AgentSuggestionState;
  declare source: CreationOptional<AgentSuggestionSource>;
  declare conversationId: ForeignKey<ConversationModel["id"]> | null;
  declare batchId: ForeignKey<BatchSuggestionModel["id"]> | null;

  declare agentConfiguration: NonAttribute<AgentConfigurationModel>;
  declare conversation: NonAttribute<ConversationModel | null>;
}

AgentSuggestionModel.init(
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
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    kind: {
      type: DataTypes.STRING,
      allowNull: false,
      comment:
        "Discriminator for the suggestion type (e.g., instructions, tools...)",
    },
    suggestion: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment:
        "JSONB payload containing the suggestion details, structure depends on kind",
    },
    analysis: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: true,
      comment:
        "Optional analysis/reasoning explaining why this suggestion was made",
    },
    title: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Optional short user-facing title of the suggestion",
    },
    state: {
      type: DataTypes.STRING,
      allowNull: false,
      comment:
        "Current state of the suggestion (e.g., pending, accepted, rejected...)",
    },
    source: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "sidekick",
      comment:
        "Provenance of the suggestion (e.g., sidekick, conversational). Defaults to " +
        "'sidekick', the only source until callers started passing it explicitly.",
    },
    conversationId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      comment:
        "FK to the conversation that triggered this suggestion (only set for synthetic suggestions)",
    },
    batchId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      comment:
        "FK to the batch this suggestion belongs to, reviewed together with the other members.",
    },
  },
  {
    modelName: "agent_suggestion",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "agent_suggestions_list_by_agent_configuration_idx",
        fields: ["workspaceId", "agentConfigurationId", "state", "kind"],
        concurrently: true,
      },
      {
        fields: ["workspaceId", "agentConfigurationId", "kind"],
        concurrently: true,
      },
      {
        fields: ["agentConfigurationId"],
        concurrently: true,
      },
      {
        fields: ["conversationId"],
        concurrently: true,
        name: "agent_suggestions_conversation_id",
      },
      {
        fields: ["workspaceId", "batchId"],
        concurrently: true,
        name: "agent_suggestions_workspace_batch_id",
        where: { batchId: { [Op.ne]: null } },
      },
    ],
  }
);

// Association with AgentConfigurationModel
AgentSuggestionModel.belongsTo(AgentConfigurationModel, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
  onDelete: "RESTRICT",
  as: "agentConfiguration",
});
AgentConfigurationModel.hasMany(AgentSuggestionModel, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
  as: "suggestions",
});

// Association with ConversationModel (nullable — only set for synthetic suggestions).
AgentSuggestionModel.belongsTo(ConversationModel, {
  foreignKey: { name: "conversationId", allowNull: true },
  onDelete: "RESTRICT",
  as: "conversation",
});

// Association with BatchSuggestionModel (nullable — only set for batched suggestions).
AgentSuggestionModel.belongsTo(BatchSuggestionModel, {
  foreignKey: { name: "batchId", allowNull: true },
  onDelete: "RESTRICT",
  as: "batch",
});
BatchSuggestionModel.hasMany(AgentSuggestionModel, {
  foreignKey: { name: "batchId", allowNull: true },
  onDelete: "RESTRICT",
});
