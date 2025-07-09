import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class AgentTablesQueryConfigurationTable extends WorkspaceAwareModel<AgentTablesQueryConfigurationTable> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare tableId: string;

  declare dataSourceId: ForeignKey<DataSourceModel["id"]> | null;
  declare dataSourceViewId: ForeignKey<DataSourceViewModel["id"]>;
  declare mcpServerConfigurationId: ForeignKey<
    AgentMCPServerConfiguration["id"]
  >;

  declare dataSource: NonAttribute<DataSourceModel>;
  declare dataSourceView: NonAttribute<DataSourceViewModel>;
}

AgentTablesQueryConfigurationTable.init(
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
    tableId: {
      type: DataTypes.STRING(512),
      allowNull: false,
    },
  },
  {
    modelName: "agent_tables_query_configuration_table",
    indexes: [
      // TODO(WORKSPACE_ID_ISOLATION 2025-05-14): Remove index
      { fields: ["dataSourceId"] },
      {
        fields: ["workspaceId", "dataSourceId"],
        concurrently: true,
        name: "agent_tables_query_config_table_workspace_id_data_source_id",
      },
      // TODO(WORKSPACE_ID_ISOLATION 2025-05-14): Remove index
      { fields: ["dataSourceViewId"] },
      {
        fields: ["workspaceId", "dataSourceViewId"],
        concurrently: true,
        name: "agent_tables_query_config_table_w_id_data_source_view_id",
      },
      {
        fields: ["workspaceId", "mcpServerConfigurationId"],
        name: "agent_tables_query_config_workspace_id_mcp_srv_config_id",
        concurrently: true,
      },
    ],
    sequelize: frontSequelize,
  }
);

// MCP server config <> Table config
AgentMCPServerConfiguration.hasMany(AgentTablesQueryConfigurationTable, {
  foreignKey: { name: "mcpServerConfigurationId", allowNull: false },
  onDelete: "RESTRICT",
});
AgentTablesQueryConfigurationTable.belongsTo(AgentMCPServerConfiguration, {
  foreignKey: { name: "mcpServerConfigurationId", allowNull: false },
  onDelete: "RESTRICT",
});

// Config <> Data source.
DataSourceModel.hasMany(AgentTablesQueryConfigurationTable, {
  foreignKey: { allowNull: false, name: "dataSourceId" },
  onDelete: "RESTRICT",
});
AgentTablesQueryConfigurationTable.belongsTo(DataSourceModel, {
  as: "dataSource",
  foreignKey: { allowNull: false, name: "dataSourceId" },
});

// Config <> Data source view.
DataSourceViewModel.hasMany(AgentTablesQueryConfigurationTable, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
AgentTablesQueryConfigurationTable.belongsTo(DataSourceViewModel, {
  as: "dataSourceView",
  foreignKey: { allowNull: false },
});
