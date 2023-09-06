import {
  DataTypes,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";

import { front_sequelize } from "@app/lib/databases";
import { AssistantAgentConfiguration } from "@app/lib/models/assistant/agent";
import { DataSource } from "@app/lib/models/data_source";
import { TimeframeUnit } from "@app/types/assistant/actions/retrieval";

/**
 * Action Retrieval configuration
 */
export class AssistantAgentRetrievalConfiguration extends Model<
  InferAttributes<AssistantAgentRetrievalConfiguration>,
  InferCreationAttributes<AssistantAgentRetrievalConfiguration>
> {
  declare id: number;

  declare query: "auto" | "none" | "templated";
  declare queryTemplate: string | null;
  declare relativeTimeFrame: "auto" | "none" | "custom";
  declare relativeTimeFrameDuration: number | null;
  declare relativeTimeFrameUnit: TimeframeUnit | null;
  declare topK: number;

  declare agentId: ForeignKey<AssistantAgentConfiguration["id"]>;
}
AssistantAgentRetrievalConfiguration.init(
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
      defaultValue: 5,
    },
  },
  {
    modelName: "assistant_agent_retrieval_configuration",
    sequelize: front_sequelize,
    hooks: {
      beforeValidate: (retrieval: AssistantAgentRetrievalConfiguration) => {
        // Validation for templated Query
        if (retrieval.query == "templated") {
          if (retrieval.queryTemplate === null) {
            throw new Error("Must set a template for templated query");
          }
        } else {
          if (retrieval.queryTemplate) {
            throw new Error("Can't set a template without templated query");
          }
        }

        // Validation for Timeframe
        if (retrieval.relativeTimeFrame == "custom") {
          if (
            retrieval.relativeTimeFrameDuration === null ||
            retrieval.relativeTimeFrameUnit === null
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
export class AssistantAgentDatasourceConfiguration extends Model<
  InferAttributes<AssistantAgentDatasourceConfiguration>,
  InferCreationAttributes<AssistantAgentDatasourceConfiguration>
> {
  declare id: number;

  declare minTimestamp: number | null;
  declare maxTimestamp: number | null;
  declare timeframeDuration: number | null;
  declare timeframeUnit: TimeframeUnit | null;

  declare tagsIn: string[];
  declare tagsOut: string[];
  declare parentsIn: string[];
  declare parentsOut: string[];

  declare datasourceId: ForeignKey<DataSource["id"]>;
  declare retrievalConfigurationId: ForeignKey<
    AssistantAgentRetrievalConfiguration["id"]
  >;
}
AssistantAgentDatasourceConfiguration.init(
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
      allowNull: false,
      defaultValue: [],
    },
    tagsOut: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
    },
    parentsIn: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
    },
    parentsOut: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
    },
  },
  {
    modelName: "assistant_agent_datasource_configuration",
    sequelize: front_sequelize,
    hooks: {
      beforeValidate: (
        datasourceConfig: AssistantAgentDatasourceConfiguration
      ) => {
        if (
          (datasourceConfig.minTimestamp === null) !==
          (datasourceConfig.maxTimestamp === null)
        ) {
          throw new Error("Timestamps must be both set or both null");
        }
        if (
          (datasourceConfig.timeframeDuration === null) !==
          (datasourceConfig.timeframeUnit === null)
        ) {
          throw new Error(
            "Timeframe duration/unit must be both set or both null"
          );
        }
        if (
          (datasourceConfig.minTimestamp !== null ||
            datasourceConfig.maxTimestamp !== null) &&
          (datasourceConfig.timeframeDuration !== null ||
            datasourceConfig.timeframeUnit !== null)
        ) {
          throw new Error("Cannot use both timestamps and timeframe");
        }
      },
    },
  }
);

// Retrieval config <> datasource config
AssistantAgentRetrievalConfiguration.hasMany(
  AssistantAgentDatasourceConfiguration,
  {
    foreignKey: { name: "retrievalId", allowNull: false },
    onDelete: "CASCADE",
  }
);

// Agent config <> Retrieval config
AssistantAgentConfiguration.hasOne(AssistantAgentRetrievalConfiguration, {
  foreignKey: { name: "agentId", allowNull: true }, // null = no generation set for this Agent
  onDelete: "CASCADE",
});
