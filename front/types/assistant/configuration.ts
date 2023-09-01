/**
 * Data Source configuration
 */

export type RelativeTimeFrame = {
  count: number;
  duration: "hour" | "day" | "week" | "month" | "year";
};

export type DataSourceConfiguration = {
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

type RetrievalConfigurationType = {
  dataSources: DataSourceConfiguration[];
  query: AutoQuery | NoQuery | TemplatedQuery;
  top_k: number;

  // Dynamically decide to skip, if needed in the future
  // autoSkip: boolean;
};

/**
 * Agent Action configuration
 */

export type AgentActionConfigurationType = RetrievalConfigurationType;

/**
 * Agent Message configuration
 */

export type AgentMessageConfigurationType = {
  prompt: string;
  model: {
    provider: string;
    modelId: string;
  };
};

/**
 * Agent configuration
 */

export type AgentConfigurationStatus = "active" | "archived";

export type AgentConfigurationType = {
  sId: string;
  name: string;
  status: AgentConfigurationStatus;

  // If undefined, no action performed, otherwise the action is
  // performed (potentially NoOp eg autoSkip above).
  action?: AgentActionConfigurationType;

  // If undefined, no text generation.
  message?: AgentMessageConfigurationType;
};
