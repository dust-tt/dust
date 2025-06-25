import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class AgentDataRetentionModel extends WorkspaceAwareModel<AgentDataRetentionModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentSId: string;
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
    agentSId: {
      type: DataTypes.STRING,
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
        fields: ["agentSId"],
        concurrently: true,
        name: "agent_data_retention_agent_s_id",
      },
      {
        fields: ["workspaceId", "agentSId"],
        unique: true,
        name: "agent_data_retention_unique_agent_workspace",
      },
    ],
  }
);
