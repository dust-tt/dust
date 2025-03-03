import type { MCPHostType } from "@dust-tt/types";
import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

/**
 * MCPClient Action
 */
export class AgentMCPAction extends WorkspaceAwareModel<AgentMCPAction> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare hostType: MCPHostType;
  declare hostUrl: string | null;
  declare params: Record<string, unknown>;
  declare tokensCount: number | null;
  declare output: string | null;
  declare functionCallId: string | null;
  declare functionCallName: string | null;

  declare step: number;
  declare agentMessageId: ForeignKey<AgentMessage["id"]>;
}

AgentMCPAction.init(
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
    hostType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    hostUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    params: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    tokensCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    output: {
      type: DataTypes.TEXT,
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
    step: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    modelName: "agent_mcp_action",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["agentMessageId"],
        concurrently: true,
      },
    ],
  }
);

AgentMCPAction.belongsTo(AgentMessage, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});

AgentMessage.hasMany(AgentMCPAction, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});
