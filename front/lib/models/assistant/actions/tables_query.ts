import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { FileModel } from "@app/lib/resources/storage/models/files";

export class AgentTablesQueryConfiguration extends Model<
  InferAttributes<AgentTablesQueryConfiguration>,
  InferCreationAttributes<AgentTablesQueryConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfigurationId: ForeignKey<AgentConfiguration["id"]>;

  declare sId: string;

  declare name: string | null;
  declare description: string | null;
}

AgentTablesQueryConfiguration.init(
  {
    id: {
      type: DataTypes.INTEGER,
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

export class AgentTablesQueryConfigurationTable extends Model<
  InferAttributes<AgentTablesQueryConfigurationTable>,
  InferCreationAttributes<AgentTablesQueryConfigurationTable>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare tableId: string;

  declare dataSourceId: ForeignKey<DataSourceModel["id"]> | null;
  declare dataSourceViewId: ForeignKey<DataSourceViewModel["id"]>;
  declare tablesQueryConfigurationId: ForeignKey<
    AgentTablesQueryConfiguration["id"]
  >;

  declare dataSource: NonAttribute<DataSourceModel>;
  declare dataSourceView: NonAttribute<DataSourceViewModel>;
}

AgentTablesQueryConfigurationTable.init(
  {
    id: {
      type: DataTypes.INTEGER,
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
    ],
    sequelize: frontSequelize,
  }
);

AgentTablesQueryConfiguration.hasMany(AgentTablesQueryConfigurationTable, {
  foreignKey: { name: "tablesQueryConfigurationId", allowNull: false },
  onDelete: "CASCADE",
});
AgentTablesQueryConfigurationTable.belongsTo(AgentTablesQueryConfiguration, {
  foreignKey: { name: "tablesQueryConfigurationId", allowNull: false },
  onDelete: "CASCADE",
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

export class AgentTablesQueryAction extends Model<
  InferAttributes<AgentTablesQueryAction>,
  InferCreationAttributes<AgentTablesQueryAction>
> {
  declare id: CreationOptional<number>;
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
}

AgentTablesQueryAction.init(
  {
    id: {
      type: DataTypes.INTEGER,
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
  foreignKey: { name: "resultsFileId", allowNull: true },
  onDelete: "SET NULL",
});
