import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { AgentProcessConfiguration } from "@app/lib/models/assistant/actions/process";
import { AgentRetrievalConfiguration } from "@app/lib/models/assistant/actions/retrieval";
import { DataSource } from "@app/lib/models/data_source";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";

/**
 * Configuration of Datasources used for Retrieval Action.
 */
export class AgentDataSourceConfiguration extends Model<
  InferAttributes<AgentDataSourceConfiguration>,
  InferCreationAttributes<AgentDataSourceConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare parentsIn: string[] | null;
  declare parentsNotIn: string[] | null;

  declare dataSourceId: ForeignKey<DataSource["id"]>;
  declare dataSourceViewId: ForeignKey<DataSourceViewModel["id"]>;

  // AgentDataSourceConfiguration can be used by both the retrieval and the process actions'
  // configurations.
  declare retrievalConfigurationId: ForeignKey<
    AgentRetrievalConfiguration["id"]
  > | null;
  declare processConfigurationId: ForeignKey<
    AgentRetrievalConfiguration["id"]
  > | null;

  declare dataSource: NonAttribute<DataSource>;
}
AgentDataSourceConfiguration.init(
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
    parentsIn: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    parentsNotIn: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
  },
  {
    modelName: "agent_data_source_configuration",
    indexes: [
      {
        fields: ["retrievalConfigurationId"],
      },
    ],
    sequelize: frontSequelize,
    hooks: {
      beforeValidate: (dataSourceConfig: AgentDataSourceConfiguration) => {
        if (
          (dataSourceConfig.parentsIn === null) !==
          (dataSourceConfig.parentsNotIn === null)
        ) {
          throw new Error("Parents must be both set or both null");
        }
      },
    },
  }
);

// Retrieval config <> Data source config
AgentRetrievalConfiguration.hasMany(AgentDataSourceConfiguration, {
  foreignKey: { name: "retrievalConfigurationId", allowNull: true },
  onDelete: "CASCADE",
});
AgentDataSourceConfiguration.belongsTo(AgentRetrievalConfiguration, {
  foreignKey: { name: "retrievalConfigurationId", allowNull: true },
});

// Process config <> Data source config
AgentProcessConfiguration.hasMany(AgentDataSourceConfiguration, {
  foreignKey: { name: "processConfigurationId", allowNull: true },
  onDelete: "CASCADE",
});
AgentDataSourceConfiguration.belongsTo(AgentProcessConfiguration, {
  foreignKey: { name: "processConfigurationId", allowNull: true },
});

// Data source config <> Data source
DataSource.hasMany(AgentDataSourceConfiguration, {
  as: "dataSource",
  foreignKey: { name: "dataSourceId", allowNull: false },
  onDelete: "CASCADE",
});
AgentDataSourceConfiguration.belongsTo(DataSource, {
  as: "dataSource",
  foreignKey: { name: "dataSourceId", allowNull: false },
});

// Data source config <> Data source view
DataSourceViewModel.hasMany(AgentDataSourceConfiguration, {
  // TODO(20240730 flav) Set to false once backfilled.
  foreignKey: { allowNull: true },
  onDelete: "RESTRICT",
});
AgentDataSourceConfiguration.belongsTo(DataSourceViewModel, {
  foreignKey: { allowNull: false },
});
