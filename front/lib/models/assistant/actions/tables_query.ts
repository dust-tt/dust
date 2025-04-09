import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { FileModel } from "@app/lib/resources/storage/models/files";
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
      {
        fields: ["agentConfigurationId"],
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
      { fields: ["dataSourceId"] },
      { fields: ["dataSourceViewId"] },
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

export class AgentTablesQueryAction extends WorkspaceAwareModel<AgentTablesQueryAction> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare runId: string | null;

  declare tablesQueryConfigurationId: string;

  declare params: unknown | null;
  declare output: unknown | null;
  declare resultsFileSnippet: string | null;

  declare functionCallId: string | null;
  declare functionCallName: string | null;

  declare agentMessageId: ForeignKey<AgentMessage["id"]>;

  declare step: number;
  declare resultsFileId: ForeignKey<FileModel["id"]> | null;
  declare sectionFileId: ForeignKey<FileModel["id"]> | null;

  declare resultsFile: NonAttribute<FileModel>;
  declare sectionFile: NonAttribute<FileModel>;
}

AgentTablesQueryAction.init(
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
    runId: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    tablesQueryConfigurationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    params: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    output: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    resultsFileSnippet: {
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
    modelName: "agent_tables_query_action",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["agentMessageId"],
        concurrently: true,
      },
      {
        fields: ["resultsFileId"],
        concurrently: true,
      },
      {
        fields: ["sectionFileId"],
        concurrently: true,
      },
    ],
  }
);

AgentTablesQueryAction.belongsTo(AgentMessage, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});

AgentMessage.hasMany(AgentTablesQueryAction, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});

FileModel.hasMany(AgentTablesQueryAction, {
  foreignKey: { name: "resultsFileId", allowNull: true },
  onDelete: "SET NULL",
});
AgentTablesQueryAction.belongsTo(FileModel, {
  as: "resultsFile",
  foreignKey: { name: "resultsFileId", allowNull: true },
  onDelete: "SET NULL",
});

FileModel.hasMany(AgentTablesQueryAction, {
  foreignKey: { name: "sectionFileId", allowNull: true },
  onDelete: "SET NULL",
});
AgentTablesQueryAction.belongsTo(FileModel, {
  as: "sectionFile",
  foreignKey: { name: "sectionFileId", allowNull: true },
  onDelete: "SET NULL",
});
