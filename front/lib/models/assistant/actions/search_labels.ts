import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import type { SearchLabelsActionOutputType } from "@app/lib/actions/types/search_labels";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ModelId } from "@app/types";

export class AgentSearchLabelsAction extends WorkspaceAwareModel<AgentSearchLabelsAction> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare runId: string | null;

  declare agentMessageId: ModelId;
  declare functionCallId: string | null;
  declare functionCallName: string | null;
  declare output: SearchLabelsActionOutputType | null;
  declare parentTool: string;
  declare searchText: string;
  declare step: number;
}
AgentSearchLabelsAction.init(
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
    runId: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    functionCallId: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    functionCallName: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    output: {
      type: DataTypes.JSONB,
      allowNull: true,
    },

    parentTool: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    searchText: {
      type: DataTypes.TEXT,
      allowNull: false,
    },

    step: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    modelName: "agent_search_labels_action",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["agentMessageId"],
        concurrently: true,
      },
    ],
  }
);

AgentSearchLabelsAction.belongsTo(AgentMessage, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});

AgentMessage.hasMany(AgentSearchLabelsAction, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});
