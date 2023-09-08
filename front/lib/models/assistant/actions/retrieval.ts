import {
  CreationOptional,
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
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

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
          if (retrieval.queryTemplate === null) {
            throw new Error("Must set a template for templated query");
          }
        } else if (retrieval.queryTemplate !== null) {
          throw new Error("Can't set a template without templated query");
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
export class AgentDataSourceConfiguration extends Model<
  InferAttributes<AgentDataSourceConfiguration>,
  InferCreationAttributes<AgentDataSourceConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

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
        if (
          (dataSourceConfig.timeframeDuration === null) !==
          (dataSourceConfig.timeframeUnit === null)
        ) {
          throw new Error(
            "Timeframe duration/unit must be both set or both null"
          );
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

/**
 * Retrieval Action
 */
export class AgentRetrievalAction extends Model<
  InferAttributes<AgentRetrievalAction>,
  InferCreationAttributes<AgentRetrievalAction>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare query: string | null;
  declare relativeTimeFrameDuration: number | null;
  declare relativeTimeFrameUnit: TimeframeUnit | null;
  declare topK: number;

  declare retrievalConfigurationId: ForeignKey<
    AgentRetrievalConfiguration["id"]
  >;
}
AgentRetrievalAction.init(
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
    query: {
      type: DataTypes.TEXT,
      allowNull: true,
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
    modelName: "agent_retrieval_action",
    sequelize: front_sequelize,
    hooks: {
      beforeValidate: (retrieval: AgentRetrievalAction) => {
        // Validation for Timeframe
        if (
          (retrieval.relativeTimeFrameDuration === null) !==
          (retrieval.relativeTimeFrameUnit === null)
        ) {
          throw new Error(
            "Relative time frame must have a duration and unit set or they should both be null"
          );
        }
      },
    },
  }
);

AgentRetrievalConfiguration.hasMany(AgentRetrievalAction, {
  foreignKey: { name: "retrievalConfigurationId", allowNull: false },
  // We don't want to delete the action when the configuration is deleted
  // But really we don't want to delete configurations ever.
});

export class RetrievalDocument extends Model<
  InferAttributes<RetrievalDocument>,
  InferCreationAttributes<RetrievalDocument>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare dataSourceId: string;
  declare sourceUrl: string | null;
  declare documentId: string;
  declare reference: string;
  declare timestamp: number;
  declare tags: string[];
  declare score: number;

  declare retrievalActionId: ForeignKey<AgentRetrievalAction["id"]>;
}

RetrievalDocument.init(
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
    dataSourceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sourceUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    documentId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    reference: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    timestamp: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
    },
    score: {
      type: DataTypes.REAL,
      allowNull: false,
    },
  },
  {
    modelName: "retrieval_document",
    sequelize: front_sequelize,
    indexes: [{ fields: ["retrievalActionId"] }],
  }
);

AgentRetrievalAction.hasMany(RetrievalDocument, {
  foreignKey: { name: "retrievalActionId", allowNull: false },
  onDelete: "CASCADE",
});

export class RetrievalDocumentChunk extends Model<
  InferAttributes<RetrievalDocumentChunk>,
  InferCreationAttributes<RetrievalDocumentChunk>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare text: string;
  declare offset: number;
  declare score: number;

  declare retrievalDocumentId: ForeignKey<RetrievalDocument["id"]>;
}

RetrievalDocumentChunk.init(
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
    text: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    offset: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    score: {
      type: DataTypes.REAL,
      allowNull: false,
    },
  },
  {
    modelName: "retrieval_document_chunk",
    sequelize: front_sequelize,
    indexes: [{ fields: ["retrievalDocumentId"] }],
  }
);

RetrievalDocument.hasMany(RetrievalDocumentChunk, {
  foreignKey: { name: "retrievalDocumentId", allowNull: false },
  onDelete: "CASCADE",
});
