import { AgentMCPActionModel } from "@app/lib/models/agent/actions/mcp";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

export class AgentStepContentToolExecutionModel extends WorkspaceAwareModel<AgentStepContentToolExecutionModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentMCPActionId: ForeignKey<AgentMCPActionModel["id"]>;
  declare stepContentId: ForeignKey<AgentStepContentModel["id"]>;
}

AgentStepContentToolExecutionModel.init(
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
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
    agentMCPActionId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    stepContentId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
  },
  {
    modelName: "agent_step_content_tool_execution",
    tableName: "agent_step_content_tool_executions",
    sequelize: frontSequelize,
    indexes: [
      // N:1 from action's side: each action has at most one stepContent.
      {
        unique: true,
        fields: ["agentMCPActionId"],
        concurrently: true,
        name: "agent_step_content_tool_executions_action",
      },
      { fields: ["stepContentId"], concurrently: true },
      { fields: ["workspaceId"], concurrently: true },
    ],
  }
);

AgentStepContentToolExecutionModel.belongsTo(AgentMCPActionModel, {
  foreignKey: { name: "agentMCPActionId", allowNull: false },
  onDelete: "RESTRICT",
});

AgentStepContentToolExecutionModel.belongsTo(AgentStepContentModel, {
  foreignKey: { name: "stepContentId", allowNull: false },
  onDelete: "RESTRICT",
});
