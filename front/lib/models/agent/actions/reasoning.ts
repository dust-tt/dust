import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ModelIdType, ModelProviderIdType } from "@app/types";
import type { AgentReasoningEffort } from "@app/types";

export class AgentReasoningConfigurationModel extends WorkspaceAwareModel<AgentReasoningConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare providerId: ModelProviderIdType;
  declare modelId: ModelIdType;
  declare temperature: number | null;
  declare reasoningEffort: AgentReasoningEffort | null;

  declare mcpServerConfigurationId: ForeignKey<
    AgentMCPServerConfigurationModel["id"]
  >;

  declare sId: string;
}

AgentReasoningConfigurationModel.init(
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
    providerId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    modelId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    temperature: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    reasoningEffort: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "agent_reasoning_configuration",
    indexes: [
      {
        unique: true,
        fields: ["sId"],
      },
      {
        fields: ["workspaceId", "mcpServerConfigurationId"],
        name: "agent_reasoning_config_workspace_id_mcp_srv_config_id",
        concurrently: true,
      },
    ],
    sequelize: frontSequelize,
  }
);

AgentMCPServerConfigurationModel.hasMany(AgentReasoningConfigurationModel, {
  foreignKey: { name: "mcpServerConfigurationId", allowNull: false },
  onDelete: "RESTRICT",
});
AgentReasoningConfigurationModel.belongsTo(AgentMCPServerConfigurationModel, {
  foreignKey: { name: "mcpServerConfigurationId", allowNull: false },
  onDelete: "RESTRICT",
});
