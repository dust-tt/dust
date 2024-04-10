import type { TimeframeUnit } from "@dust-tt/types";
import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { AgentRetrievalConfiguration } from "@app/lib/models/assistant/agent";
import { DataSource } from "@app/lib/models/data_source";
import { frontSequelize } from "@app/lib/resources/storage";

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

  declare tagsIn: string[] | null;
  declare tagsNotIn: string[] | null;
  declare parentsIn: string[] | null;
  declare parentsNotIn: string[] | null;

  declare dataSourceId: ForeignKey<DataSource["id"]>;
  declare retrievalConfigurationId: ForeignKey<
    AgentRetrievalConfiguration["id"]
  >;

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
    indexes: [
      {
        fields: ["retrievalConfigurationId"],
      },
    ],
    sequelize: frontSequelize,
    hooks: {
      beforeValidate: (dataSourceConfig: AgentDataSourceConfiguration) => {
        if (
          (dataSourceConfig.tagsIn === null) !==
          (dataSourceConfig.tagsNotIn === null)
        ) {
          throw new Error("Tags must be both set or both null");
        }
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
  foreignKey: { name: "retrievalConfigurationId", allowNull: false },
  onDelete: "CASCADE",
});
AgentDataSourceConfiguration.belongsTo(AgentRetrievalConfiguration, {
  foreignKey: { name: "retrievalConfigurationId", allowNull: false },
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

  declare retrievalConfigurationId: string;

  declare query: string | null;
  declare relativeTimeFrameDuration: number | null;
  declare relativeTimeFrameUnit: TimeframeUnit | null;
  declare topK: number;
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
    retrievalConfigurationId: {
      type: DataTypes.STRING,
      allowNull: false,
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
    sequelize: frontSequelize,
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

export class RetrievalDocument extends Model<
  InferAttributes<RetrievalDocument>,
  InferCreationAttributes<RetrievalDocument>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare dataSourceWorkspaceId: string;
  declare dataSourceId: string;
  declare sourceUrl: string | null;
  declare documentId: string;
  declare reference: string;
  declare documentTimestamp: Date;
  declare tags: string[];
  declare score: number | null;

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
    dataSourceWorkspaceId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    dataSourceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sourceUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    documentId: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    reference: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    documentTimestamp: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
    },
    score: {
      type: DataTypes.REAL,
      allowNull: true,
    },
  },
  {
    modelName: "retrieval_document",
    sequelize: frontSequelize,
    indexes: [{ fields: ["retrievalActionId"] }],
  }
);

AgentRetrievalAction.hasMany(RetrievalDocument, {
  foreignKey: { name: "retrievalActionId", allowNull: false },
  onDelete: "CASCADE",
});
RetrievalDocument.belongsTo(AgentRetrievalAction, {
  foreignKey: { name: "retrievalActionId", allowNull: false },
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
  declare score: number | null;

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
      allowNull: true,
    },
  },
  {
    modelName: "retrieval_document_chunk",
    sequelize: frontSequelize,
    indexes: [{ fields: ["retrievalDocumentId"] }],
  }
);

RetrievalDocument.hasMany(RetrievalDocumentChunk, {
  foreignKey: { name: "retrievalDocumentId", allowNull: false },
  onDelete: "CASCADE",
});
RetrievalDocumentChunk.belongsTo(RetrievalDocument, {
  foreignKey: { name: "retrievalDocumentId", allowNull: false },
});
