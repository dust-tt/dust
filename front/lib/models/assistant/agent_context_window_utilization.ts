import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class AgentMessageContextWindowUtilization extends WorkspaceAwareModel<AgentMessageContextWindowUtilization> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare step: number;

  declare usedTokens: number;
  declare availableTokens: number;

  declare agentMessageId: ForeignKey<AgentMessage["id"]>;
  declare agentMessage?: NonAttribute<AgentMessage>;
}

AgentMessageContextWindowUtilization.init(
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
    step: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    usedTokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    availableTokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    modelName: "agent_message_context_window_utilization",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["agentMessageId"],
      },
      {
        fields: ["workspaceId"],
      },
    ],
  }
);

AgentMessage.hasMany(AgentMessageContextWindowUtilization, {
  foreignKey: { name: "agentMessageId", allowNull: false },
  onDelete: "RESTRICT",
});

AgentMessageContextWindowUtilization.belongsTo(AgentMessage, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});
