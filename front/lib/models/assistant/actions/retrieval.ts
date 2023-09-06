import {
  DataTypes,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";

import { front_sequelize } from "@app/lib/databases";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { DataSource } from "@app/lib/models/data_source";
import { TimeframeUnit } from "@app/types/assistant/actions/retrieval";

/**
 * Action Retrieval configuration
 */
export class AgentRetrievalConfiguration extends Model<
  InferAttributes<AgentRetrievalConfiguration>,
  InferCreationAttributes<AgentRetrievalConfiguration>
> {
  declare id: number;

  declare query: "auto" | "none" | "templated";
  declare queryTemplate: string | null;
  declare relativeTimeFrame: "auto" | "none" | "custom";
  declare relativeTimeFrameDuration: number | null;
  declare relativeTimeFrameUnit: TimeframeUnit | null;
  declare topK: number;

  declare agentId: ForeignKey<AgentConfiguration["id"]>;
}
AgentRetrievalConfiguration.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    query: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "auto",
    },
    queryTemplate: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    relativeTimeFrame: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "auto",
    },
    relativeTimeFrameDuration: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    relativeTimeFrameUnit: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    topK: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    modelName: "agent_retrieval_configuration",
    sequelize: front_sequelize,
    hooks: {
      beforeValidate: (retrieval: AgentRetrievalConfiguration) => {
        // Validation for templated Query
        if (retrieval.query == "templated") {
          if (!retrieval.queryTemplate) {
            throw new Error("Must set a template for templated query");
          }
        } else if (retrieval.queryTemplate) {
          throw new Error("Can't set a template without templated query");
        }

        // Validation for Timeframe
        if (retrieval.relativeTimeFrame == "custom") {
          if (
            !retrieval.relativeTimeFrameDuration ||
            !retrieval.relativeTimeFrameUnit
          ) {
            throw new Error(
              "Custom relative time frame must have a duration and unit set"
            );
          }
        }
      },
    },
  }
);

/**
 * Configuration of Datasources used for Retrieval Action.
 */
export class AgentDataSourceConfiguration extends Model<
  InferAttributes<AgentDataSourceConfiguration>,
  InferCreationAttributes<AgentDataSourceConfiguration>
> {
  declare id: number;

  declare minTimestamp: number | null;
  declare maxTimestamp: number | null;
  declare timeframeDuration: number | null;
  declare timeframeUnit: TimeframeUnit | null;

  declare tagsIn: string[] | null;
  declare tagsNotIn: string[] | null;
  declare parentsIn: string[] | null;
  declare parentsNotIn: string[] | null;

  declare dataSourceId: ForeignKey<DataSource["id"]>;
  declare retrievalConfigurationId: ForeignKey<
    AgentRetrievalConfiguration["id"]
  >;
}
AgentDataSourceConfiguration.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    minTimestamp: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    maxTimestamp: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    timeframeDuration: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    timeframeUnit: {
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
    sequelize: front_sequelize,
    hooks: {
      beforeValidate: (dataSourceConfig: AgentDataSourceConfiguration) => {
        if (!dataSourceConfig.minTimestamp !== !dataSourceConfig.maxTimestamp) {
          throw new Error("Timestamps must be both set or both null");
        }
        if (
          !dataSourceConfig.timeframeDuration !==
          !dataSourceConfig.timeframeUnit
        ) {
          throw new Error(
            "Timeframe duration/unit must be both set or both null"
          );
        }
        if (
          (dataSourceConfig.minTimestamp || dataSourceConfig.maxTimestamp) &&
          (dataSourceConfig.timeframeDuration || dataSourceConfig.timeframeUnit)
        ) {
          throw new Error("Cannot use both timestamps and timeframe");
        }
      },
    },
  }
);

// Retrieval config <> data source config
AgentRetrievalConfiguration.hasMany(AgentDataSourceConfiguration, {
  foreignKey: { name: "retrievalId", allowNull: false },
  onDelete: "CASCADE",
});

// Agent config <> Retrieval config
AgentConfiguration.hasOne(AgentRetrievalConfiguration, {
  foreignKey: { name: "agentId", allowNull: true }, // null = no generation set for this Agent
  onDelete: "CASCADE",
});
