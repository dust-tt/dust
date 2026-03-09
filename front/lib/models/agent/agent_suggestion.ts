import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type {
  AgentSuggestionKind,
  AgentSuggestionSource,
  AgentSuggestionState,
  SuggestionPayload,
} from "@app/types/suggestions/agent_suggestion";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

export class AgentSuggestionModel extends WorkspaceAwareModel<AgentSuggestionModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfigurationId: ForeignKey<AgentConfigurationModel["id"]>;

  declare kind: AgentSuggestionKind;
  declare suggestion: SuggestionPayload;
  declare analysis: string | null;

  declare state: AgentSuggestionState;
  declare source: AgentSuggestionSource;

  declare agentConfiguration: NonAttribute<AgentConfigurationModel>;
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
      type: DataTypes.TEXT,
      allowNull: true,
      comment:
        "Optional analysis/reasoning explaining why this suggestion was made",
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
      comment: "Origin of the suggestion such as reinforcement or copilot",
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
