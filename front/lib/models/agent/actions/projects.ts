import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { frontSequelize } from "@app/lib/resources/storage";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

/**
 * Configuration of Projects (Spaces) used for MCP server actions.
 * This stores which projects are configured for tools that use DUST_PROJECT input type.
 */
export class AgentProjectConfigurationModel extends WorkspaceAwareModel<AgentProjectConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Foreign key to the Space (project).
  declare projectId: ForeignKey<SpaceModel["id"]>;

  declare mcpServerConfigurationId: ForeignKey<
    AgentMCPServerConfigurationModel["id"]
  >;

  declare project: NonAttribute<SpaceModel>;
}

AgentProjectConfigurationModel.init(
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
  },
  {
    modelName: "agent_project_configuration",
    indexes: [
      {
        fields: ["workspaceId", "mcpServerConfigurationId"],
        name: "agent_project_config_workspace_id_mcp_srv_config_id",
        concurrently: true,
      },
      {
        fields: ["workspaceId", "projectId"],
        concurrently: true,
        name: "agent_project_config_workspace_id_project_id",
      },
    ],
    sequelize: frontSequelize,
  }
);

// MCP server config <> Project config
AgentMCPServerConfigurationModel.hasMany(AgentProjectConfigurationModel, {
  foreignKey: { name: "mcpServerConfigurationId", allowNull: false },
  onDelete: "RESTRICT",
});
AgentProjectConfigurationModel.belongsTo(AgentMCPServerConfigurationModel, {
  foreignKey: { name: "mcpServerConfigurationId", allowNull: false },
});

// Space <> Project config
SpaceModel.hasMany(AgentProjectConfigurationModel, {
  foreignKey: { name: "projectId", allowNull: false },
  as: "projectConfigurations",
  onDelete: "RESTRICT",
});
AgentProjectConfigurationModel.belongsTo(SpaceModel, {
  foreignKey: { name: "projectId", allowNull: false },
  as: "project",
  onDelete: "RESTRICT",
});
