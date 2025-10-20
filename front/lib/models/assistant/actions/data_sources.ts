import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

/**
 * Configuration of Data Sources used for Retrieval, Process and MCP server actions.
 */
export class AgentDataSourceConfiguration extends WorkspaceAwareModel<AgentDataSourceConfiguration> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare parentsIn: string[] | null;
  declare parentsNotIn: string[] | null;

  declare tagsMode: "custom" | "auto" | null;
  declare tagsIn: string[] | null;
  declare tagsNotIn: string[] | null;

  declare dataSourceId: ForeignKey<DataSourceModel["id"]>;
  declare dataSourceViewId: ForeignKey<DataSourceViewModel["id"]>;

  // AgentDataSourceConfiguration can be used by both the retrieval
  // and the MCP actions' configurations.
  declare mcpServerConfigurationId: ForeignKey<
    AgentMCPServerConfiguration["id"]
  > | null;

  declare dataSource: NonAttribute<DataSourceModel>;
  declare dataSourceView: NonAttribute<DataSourceViewModel>;
}
AgentDataSourceConfiguration.init(
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
    parentsIn: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    parentsNotIn: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    tagsMode: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    tagsIn: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    tagsNotIn: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
  },
  {
    modelName: "agent_data_source_configuration",
    indexes: [
      { fields: ["mcpServerConfigurationId"] },
      {
        fields: ["workspaceId", "mcpServerConfigurationId"],
        name: "agent_data_source_config_workspace_id_mcp_srv_config_id",
        concurrently: true,
      },
      // TODO(WORKSPACE_ID_ISOLATION 2025-05-14): Remove index
      { fields: ["dataSourceId"] },
      {
        fields: ["workspaceId", "dataSourceId"],
        concurrently: true,
      },

      // TODO(WORKSPACE_ID_ISOLATION 2025-05-14): Remove index
      { fields: ["dataSourceViewId"] },
      {
        fields: ["workspaceId", "dataSourceViewId"],
        concurrently: true,
        name: "agent_data_source_config_workspace_id_data_source_view_id",
      },
      {
        fields: ["workspaceId"],
        concurrently: true,
      },
    ],
    sequelize: frontSequelize,
    hooks: {
      beforeValidate: (dsConfig: AgentDataSourceConfiguration) => {
        // Checking tags.
        if ((dsConfig.tagsIn === null) !== (dsConfig.tagsNotIn === null)) {
          throw new Error("Tags must be both set or both null");
        }
        if (dsConfig.tagsMode === "auto") {
          if (!dsConfig.tagsIn || !dsConfig.tagsNotIn) {
            throw new Error("TagsIn/notIn must be set if tagsMode is auto.");
          }
        } else if (dsConfig.tagsMode === "custom") {
          if (!dsConfig.tagsIn?.length && !dsConfig.tagsNotIn?.length) {
            throw new Error(
              "TagsIn/notIn can't be both empty if tagsMode is custom"
            );
          }
        } else {
          if (dsConfig.tagsIn !== null || dsConfig.tagsNotIn !== null) {
            throw new Error(
              "TagsIn/notIn must be null if tagsMode is auto or null"
            );
          }
        }
      },
    },
  }
);

// MCP server config <> Data source config
AgentMCPServerConfiguration.hasMany(AgentDataSourceConfiguration, {
  foreignKey: { name: "mcpServerConfigurationId", allowNull: true },
  onDelete: "RESTRICT",
});
AgentDataSourceConfiguration.belongsTo(AgentMCPServerConfiguration, {
  foreignKey: { name: "mcpServerConfigurationId", allowNull: true },
});

// Data source config <> Data source
DataSourceModel.hasMany(AgentDataSourceConfiguration, {
  as: "dataSource",
  foreignKey: { name: "dataSourceId", allowNull: false },
  onDelete: "RESTRICT",
});
AgentDataSourceConfiguration.belongsTo(DataSourceModel, {
  as: "dataSource",
  foreignKey: { name: "dataSourceId", allowNull: false },
});

// Data source config <> Data source view
DataSourceViewModel.hasMany(AgentDataSourceConfiguration, {
  as: "dataSourceView",
  foreignKey: { allowNull: true },
  onDelete: "RESTRICT",
});
AgentDataSourceConfiguration.belongsTo(DataSourceViewModel, {
  as: "dataSourceView",
  foreignKey: { allowNull: false },
});
