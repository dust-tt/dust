import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class AgentDataRetentionModel extends WorkspaceAwareModel<AgentDataRetentionModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfigurationId: ForeignKey<AgentConfiguration["id"]>;
  declare retentionDays: number;
}

AgentDataRetentionModel.init(
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
    retentionDays: {
      type: DataTypes.BIGINT,
      allowNull: false,
      validate: {
        min: 1,
      },
    },
  },
  {
    modelName: "agent_data_retention",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["agentConfigurationId"],
        concurrently: true,
      },
      {
        fields: ["workspaceId", "agentConfigurationId"],
        unique: true,
        name: "agent_data_retention_unique_agent_workspace",
      },
    ],
  }
);

AgentConfiguration.hasOne(AgentDataRetentionModel, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
  onDelete: "CASCADE",
});

AgentDataRetentionModel.belongsTo(AgentConfiguration, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
});
