import { ModelId } from "@app/lib/databases";
import {
  RetrievalQuery,
  RetrievalTimeframe,
} from "@app/types/assistant/actions/retrieval";

/**
 * Agent config
 */
export type AgentConfigurationStatus = "active" | "archived";
export type AgentConfigurationScope = "global" | "workspace";
export type AgentConfigurationType = {
  sId: string;
  status: AgentConfigurationStatus;
  name: string;
  pictureUrl: string | null;
  action: AgentActionConfigurationType | null; // If undefined, no action performed
  generation: AgentGenerationConfigurationType | null; // If undefined, no text generation.
};

/**
 * Generation config
 */
export type AgentGenerationConfigurationType = {
  id: ModelId;
  prompt: string;
  model: {
    providerId: string;
    modelId: string;
  };
};

/**
 * Action > Retrieval
 */
export type AgentActionConfigurationType = RetrievalConfigurationType;

/**
 * Retrieval Action config
 */
export type RetrievalConfigurationType = {
  id: ModelId;

  type: "retrieval_configuration";
  dataSources: AgentDataSourceConfigurationType[];
  query: RetrievalQuery;
  relativeTimeFrame: RetrievalTimeframe;
  topK: number;
};
export function isRetrievalConfiguration(
  arg: AgentActionConfigurationType | null
): arg is RetrievalConfigurationType {
  return arg !== null && arg.type && arg.type === "retrieval_configuration";
}

/**
 * Datasources config for Retrieval Action
 */
export type AgentDataSourceConfigurationType = {
  workspaceId: string; // need sId to talk with Core (external id)
  dataSourceId: string; // need Datasource.name to talk with Core (external id)
  filter: {
    tags: { in: string[]; not: string[] } | null;
    parents: { in: string[]; not: string[] } | null;
  };
};
