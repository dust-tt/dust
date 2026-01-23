import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type {
  AgentSuggestionKind,
  AgentSuggestionSource,
  AgentSuggestionState,
  SuggestionPayload,
} from "@app/types/suggestions/agent_suggestion";

export class AgentSuggestionModel extends WorkspaceAwareModel<AgentSuggestionModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Reference agent by sId because sId cannot be inferred from id alone
  declare agentConfigurationIdTmp: string;
  declare agentConfigurationVersion: number;

  declare kind: AgentSuggestionKind;
  declare suggestion: SuggestionPayload;
  declare analysis: string | null;

  declare state: AgentSuggestionState;
  declare source: AgentSuggestionSource;
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
    agentConfigurationIdTmp: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    agentConfigurationVersion: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment:
        "Version of the agent configuration when the suggestion was created",
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
        fields: ["workspaceId", "agentConfigurationIdTmp"],
        concurrently: true,
      },
    ],
  }
);
