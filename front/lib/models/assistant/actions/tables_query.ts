import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class AgentTablesQueryConfiguration extends WorkspaceAwareModel<AgentTablesQueryConfiguration> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfigurationId: ForeignKey<AgentConfiguration["id"]>;

  declare sId: string;

  declare name: string | null;
  declare description: string | null;
}

AgentTablesQueryConfiguration.init(
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
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    modelName: "agent_tables_query_configuration",
    indexes: [
      {
        unique: true,
        fields: ["sId"],
        name: "agent_tables_query_configuration_s_id",
      },
      // TODO(WORKSPACE_ID_ISOLATION 2025-05-13): Remove this index.
      {
        fields: ["agentConfigurationId"],
        concurrently: true,
      },
      {
        fields: ["workspaceId", "agentConfigurationId"],
        name: "agent_tables_query_config_workspace_id_agent_config_id",
        concurrently: true,
      },
    ],
    sequelize: frontSequelize,
  }
);

AgentConfiguration.hasMany(AgentTablesQueryConfiguration, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
});
AgentTablesQueryConfiguration.belongsTo(AgentConfiguration, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
});

export class AgentTablesQueryConfigurationTable extends WorkspaceAwareModel<AgentTablesQueryConfigurationTable> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare tableId: string;

  declare dataSourceId: ForeignKey<DataSourceModel["id"]> | null;
  declare dataSourceViewId: ForeignKey<DataSourceViewModel["id"]>;
  declare tablesQueryConfigurationId: ForeignKey<
    AgentTablesQueryConfiguration["id"]
  > | null;
  declare mcpServerConfigurationId: ForeignKey<
    AgentMCPServerConfiguration["id"]
  > | null;

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
      {
        unique: true,
        fields: ["dataSourceViewId", "tableId", "tablesQueryConfigurationId"],
        name: "agent_tables_query_configuration_table_unique_dsv",
      },
      {
        fields: ["workspaceId", "tablesQueryConfigurationId"],
        concurrently: true,
        name: "agent_tables_query_config_table_w_id_tables_query_config_id",
      },
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

// Table query config <> Table config
AgentTablesQueryConfiguration.hasMany(AgentTablesQueryConfigurationTable, {
  foreignKey: { name: "tablesQueryConfigurationId", allowNull: true },
  onDelete: "RESTRICT",
});
AgentTablesQueryConfigurationTable.belongsTo(AgentTablesQueryConfiguration, {
  foreignKey: { name: "tablesQueryConfigurationId", allowNull: true },
  onDelete: "RESTRICT",
});

// MCP server config <> Table config
AgentMCPServerConfiguration.hasMany(AgentTablesQueryConfigurationTable, {
  foreignKey: { name: "mcpServerConfigurationId", allowNull: true },
  onDelete: "RESTRICT",
});
AgentTablesQueryConfigurationTable.belongsTo(AgentMCPServerConfiguration, {
  foreignKey: { name: "mcpServerConfigurationId", allowNull: true },
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
