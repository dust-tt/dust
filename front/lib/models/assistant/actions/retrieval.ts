import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { TimeframeUnit } from "@app/types";

export class AgentRetrievalConfiguration extends WorkspaceAwareModel<AgentRetrievalConfiguration> {
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
      // TODO(WORKSPACE_ID_ISOLATION 2025-05-13): Remove this index.
      {
        fields: ["agentConfigurationId"],
        concurrently: true,
      },
      {
        fields: ["workspaceId", "agentConfigurationId"],
        concurrently: true,
        name: "agent_retrieval_config_workspace_id_agent_config_id",
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
export class AgentRetrievalAction extends WorkspaceAwareModel<AgentRetrievalAction> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare runId: string | null;

  declare retrievalConfigurationId: string;

  declare query: string | null;
  declare relativeTimeFrameDuration: number | null;
  declare relativeTimeFrameUnit: TimeframeUnit | null;
  declare topK: number;

  declare tagsIn: string[] | null;
  declare tagsNot: string[] | null;

  declare functionCallId: string | null;
  declare functionCallName: string | null;

  declare agentMessageId: ForeignKey<AgentMessage["id"]>;
  declare step: number;
}
AgentRetrievalAction.init(
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
    tagsIn: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    tagsNot: {
      type: DataTypes.ARRAY(DataTypes.STRING),
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
      // TODO(WORKSPACE_ID_ISOLATION 2025-05-12): Remove index.
      {
        fields: ["agentMessageId"],
      },
      {
        fields: ["workspaceId", "agentMessageId"],
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

export class RetrievalDocumentModel extends WorkspaceAwareModel<RetrievalDocumentModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sourceUrl: string | null;
  declare documentId: string;
  declare reference: string;
  declare documentTimestamp: Date;
  declare tags: string[];
  declare score: number | null;

  // This is nullable as it has to be set null when data sources are deleted.
  declare dataSourceViewId: ForeignKey<DataSourceViewModel["id"]> | null;
  declare retrievalActionId: ForeignKey<AgentRetrievalAction["id"]> | null;

  declare chunks: NonAttribute<RetrievalDocumentChunkModel[]>;
  declare dataSourceView: NonAttribute<DataSourceViewModel>;
}

RetrievalDocumentModel.init(
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
    indexes: [
      // TODO(WORKSPACE_ID_ISOLATION 2025-05-12): Remove this index.
      { fields: ["retrievalActionId"] },
      { fields: ["dataSourceViewId"] },
      { fields: ["workspaceId", "retrievalActionId"] },
    ],
  }
);

AgentRetrievalAction.hasMany(RetrievalDocumentModel, {
  foreignKey: { name: "retrievalActionId", allowNull: true },
  onDelete: "SET NULL",
});
RetrievalDocumentModel.belongsTo(AgentRetrievalAction, {
  foreignKey: { name: "retrievalActionId", allowNull: true },
});

DataSourceViewModel.hasMany(RetrievalDocumentModel, {
  foreignKey: { allowNull: true },
  onDelete: "SET NULL",
});
RetrievalDocumentModel.belongsTo(DataSourceViewModel, {
  as: "dataSourceView",
  foreignKey: { allowNull: true },
});

export class RetrievalDocumentChunkModel extends WorkspaceAwareModel<RetrievalDocumentChunkModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare text: string;
  declare offset: number;
  declare score: number | null;

  declare retrievalDocumentId: ForeignKey<RetrievalDocumentModel["id"]>;
}

RetrievalDocumentChunkModel.init(
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
    indexes: [
      { fields: ["retrievalDocumentId"] },
      { fields: ["workspaceId", "id"] },
    ],
  }
);

RetrievalDocumentModel.hasMany(RetrievalDocumentChunkModel, {
  foreignKey: { name: "retrievalDocumentId", allowNull: false },
  onDelete: "CASCADE",
  as: "chunks",
});
RetrievalDocumentChunkModel.belongsTo(RetrievalDocumentModel, {
  foreignKey: { name: "retrievalDocumentId", allowNull: false },
});
