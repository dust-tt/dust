/**
 * Data Source configuration
 */

import { ModelId } from "@app/lib/databases";

export type RelativeTimeFrame = {
  count: number;
  duration: "hour" | "day" | "week" | "month" | "year";
};

export type DataSourceFilter = {
  since?: RelativeTimeFrame;
  timestamp?: { gt?: number; lt?: number };
  tags?: { in?: string[]; not?: string[] };
  parents?: { in?: string[]; not?: string[] };
};

/**
 * Retrieval configuration
 */

export type AutoQuery = "auto";
export type NoQuery = "none";
export type TemplatedQuery = {
  template: string;
};

export type RetrievalConfigurationType = {
  dataSources: DataSourceFilter[];
  query: AutoQuery | NoQuery | TemplatedQuery;
  top_k: number;

  // Dynamically decide to skip, if needed in the future
  // autoSkip: boolean;
};

/**
 * Retrieval action
 */

export type RetrievalDocumentType = {
  id: ModelId;
  dataSourceId: string;
  sourceUrl?: string;
  documentId: string;
  timestamp: number;
  tags: string[];
  score: number;
  chunks: {
    text: string;
    offset: number;
    score: number;
  }[];
};

export type RetrievalActionType = {
  id: ModelId; // AssistantAgentRetrieval.
  params: {
    dataSources: DataSourceFilter[];
    query: string | null;
    top_k: number;
  };
  documents: RetrievalDocumentType[];
};
