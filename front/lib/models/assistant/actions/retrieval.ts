import type { TimeframeUnit } from "@dust-tt/types";
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

export class AgentRetrievalConfiguration extends Model<
  InferAttributes<AgentRetrievalConfiguration>,
  InferCreationAttributes<AgentRetrievalConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfigurationId: ForeignKey<AgentConfiguration["id"]>;

  declare sId: string;

  declare query: "auto" | "none";
  declare relativeTimeFrame: "auto" | "none" | "custom";
  declare relativeTimeFrameDuration: number | null;
  declare relativeTimeFrameUnit: TimeframeUnit | null;
  declare topK: number | null;
  declare topKMode: "auto" | "custom";

  declare name: string | null;
  declare description: string | null;
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
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    query: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "auto",
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
      allowNull: true,
    },
    topKMode: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "auto",
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
    modelName: "agent_retrieval_configuration",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["agentConfigurationId"],
        concurrently: true,
      },
      {
        unique: true,
        fields: ["sId"],
        concurrently: true,
      },
    ],
    hooks: {
      beforeValidate: (retrieval: AgentRetrievalConfiguration) => {
        // Validation for Timeframe
        if (retrieval.relativeTimeFrame === "custom") {
          if (
            !retrieval.relativeTimeFrameDuration ||
            !retrieval.relativeTimeFrameUnit
          ) {
            throw new Error(
              "Custom relative time frame must have a duration and unit set"
            );
          }
        }

        // Validation for TopK
        if (retrieval.topKMode == "custom") {
          if (!retrieval.topK) {
            throw new Error("topK must be set when topKMode is 'custom'");
          }
        } else if (retrieval.topK) {
          throw new Error("topK must be null when topKMode is not 'custom'");
        }
      },
    },
  }
);

AgentConfiguration.hasMany(AgentRetrievalConfiguration, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
});
AgentRetrievalConfiguration.belongsTo(AgentConfiguration, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
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
  declare runId: string | null;

  declare retrievalConfigurationId: string;

  declare query: string | null;
  declare relativeTimeFrameDuration: number | null;
  declare relativeTimeFrameUnit: TimeframeUnit | null;
  declare topK: number;

  declare functionCallId: string | null;
  declare functionCallName: string | null;

  declare agentMessageId: ForeignKey<AgentMessage["id"]>;
  declare step: number;
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
    runId: {
      type: DataTypes.STRING,
      allowNull: true,
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
    modelName: "agent_retrieval_action",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["agentMessageId"],
        concurrently: true,
      },
    ],
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

AgentRetrievalAction.belongsTo(AgentMessage, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});

AgentMessage.hasMany(AgentRetrievalAction, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});

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

  declare chunks: NonAttribute<RetrievalDocumentChunk[]>;
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
  as: "chunks",
});
RetrievalDocumentChunk.belongsTo(RetrievalDocument, {
  foreignKey: { name: "retrievalDocumentId", allowNull: false },
});
