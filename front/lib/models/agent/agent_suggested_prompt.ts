import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional } from "sequelize";

export class AgentSuggestedPromptModel extends WorkspaceAwareModel<AgentSuggestedPromptModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfigurationId: string;
  declare prompt: string;
}

AgentSuggestedPromptModel.init(
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
      type: DataTypes.STRING,
      allowNull: false,
    },
    prompt: {
      type: DataTypes.STRING(256),
      allowNull: false,
    },
  },
  {
    modelName: "agent_suggested_prompts",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "agent_suggested_prompts_workspace_agent_idx",
        fields: ["workspaceId", "agentConfigurationId"],
      },
    ],
  }
);
