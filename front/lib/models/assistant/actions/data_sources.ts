import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import type { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { AgentProcessConfiguration } from "@app/lib/models/assistant/actions/process";
import { AgentRetrievalConfiguration } from "@app/lib/models/assistant/actions/retrieval";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

/**
 * Configuration of Datasources used for Retrieval Action.
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

  // AgentDataSourceConfiguration can be used by both the retrieval, the process
  // and the MCP actions' configurations.
  declare retrievalConfigurationId: ForeignKey<
    AgentRetrievalConfiguration["id"]
  > | null;
  declare processConfigurationId: ForeignKey<
    AgentRetrievalConfiguration["id"]
  > | null;
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
      { fields: ["retrievalConfigurationId"] },
      { fields: ["processConfigurationId"] },
      { fields: ["mcpServerConfigurationId"] },
      { fields: ["dataSourceId"] },
      { fields: ["dataSourceViewId"] },
    ],
    sequelize: frontSequelize,
    hooks: {
      beforeValidate: (dsConfig: AgentDataSourceConfiguration) => {
        // Checking parents.
        if (
          (dsConfig.parentsIn === null) !==
          (dsConfig.parentsNotIn === null)
        ) {
          throw new Error("Parents must be both set or both null");
        }
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

// Retrieval config <> Data source config
AgentRetrievalConfiguration.hasMany(AgentDataSourceConfiguration, {
  foreignKey: { name: "retrievalConfigurationId", allowNull: true },
  onDelete: "RESTRICT",
});
AgentDataSourceConfiguration.belongsTo(AgentRetrievalConfiguration, {
  foreignKey: { name: "retrievalConfigurationId", allowNull: true },
});

// Process config <> Data source config
AgentProcessConfiguration.hasMany(AgentDataSourceConfiguration, {
  foreignKey: { name: "processConfigurationId", allowNull: true },
  onDelete: "RESTRICT",
});
AgentDataSourceConfiguration.belongsTo(AgentProcessConfiguration, {
  foreignKey: { name: "processConfigurationId", allowNull: true },
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
