import type {
  AgentConfigurationScope,
  AppType,
  ContentNode,
  DataSourceType,
  ProcessSchemaPropertyType,
  SupportedModel,
  TimeframeUnit,
} from "@dust-tt/types";
import { GPT_4_TURBO_MODEL_CONFIG } from "@dust-tt/types";

export const ACTION_MODES = [
  "GENERIC",
  "RETRIEVAL_SEARCH",
  "RETRIEVAL_EXHAUSTIVE",
  "DUST_APP_RUN",
  "TABLES_QUERY",
  "PROCESS",
] as const;

export type ActionMode = (typeof ACTION_MODES)[number];

// Retrieval configuration

export type AssistantBuilderDataSourceConfiguration = {
  dataSource: DataSourceType;
  selectedResources: ContentNode[];
  isSelectAll: boolean;
};

export type AssistantBuilderDataSourceConfigurations = Record<
  string,
  AssistantBuilderDataSourceConfiguration
>;

export type AssistantBuilderTimeFrame = {
  value: number;
  unit: TimeframeUnit;
};

export type AssistantBuilderRetrievalConfiguration = {
  dataSourceConfigurations: AssistantBuilderDataSourceConfigurations;
  timeFrame: AssistantBuilderTimeFrame;
};

// DustAppRun configuration

export type AssistantBuilderDustAppConfiguration = {
  app: AppType | null;
};

// TablesQuery configuration

export type AssistantBuilderTableConfiguration = {
  dataSourceId: string;
  workspaceId: string;
  tableId: string;
  tableName: string;
  connectorContentNodeInternalId?: string;
};

export type AssistantBuilderTablesQueryConfiguration = Record<
  string,
  AssistantBuilderTableConfiguration
>;

// Process configuration

export type AssistantBuilderProcessConfiguration = {
  dataSourceConfigurations: AssistantBuilderDataSourceConfigurations;
  timeFrame: AssistantBuilderTimeFrame;
  schema: ProcessSchemaPropertyType[];
};

// Builder State

export type AssistantBuilderState = {
  handle: string | null;
  description: string | null;
  scope: Exclude<AgentConfigurationScope, "global">;
  instructions: string | null;
  avatarUrl: string | null;
  generationSettings: {
    modelSettings: SupportedModel;
    temperature: number;
  };
  // Actions
  // We want assistant builder state for action to always have empty default, never null which
  // would complexify the assistant builder logic.
  actionMode: ActionMode;
  retrievalConfiguration: AssistantBuilderRetrievalConfiguration;
  dustAppConfiguration: AssistantBuilderDustAppConfiguration;
  tablesQueryConfiguration: AssistantBuilderTablesQueryConfiguration;
  processConfiguration: AssistantBuilderProcessConfiguration;
};

export type AssistantBuilderInitialState = {
  handle: string;
  description: string;
  scope: Exclude<AgentConfigurationScope, "global">;
  instructions: string;
  avatarUrl: string | null;
  generationSettings: {
    modelSettings: SupportedModel;
    temperature: number;
  } | null;
  // Actions
  actionMode: AssistantBuilderState["actionMode"];
  retrievalConfiguration: AssistantBuilderState["retrievalConfiguration"];
  dustAppConfiguration: AssistantBuilderState["dustAppConfiguration"];
  tablesQueryConfiguration: AssistantBuilderState["tablesQueryConfiguration"];
  processConfiguration: AssistantBuilderState["processConfiguration"];
};

export const DEFAULT_ASSISTANT_STATE: AssistantBuilderState = {
  actionMode: "GENERIC",
  retrievalConfiguration: {
    dataSourceConfigurations: {},
    timeFrame: {
      value: 1,
      unit: "month",
    },
  },
  dustAppConfiguration: { app: null },
  tablesQueryConfiguration: {},
  processConfiguration: {
    dataSourceConfigurations: {},
    timeFrame: {
      value: 1,
      unit: "day",
    },
    schema: [],
  },
  handle: null,
  scope: "private",
  description: null,
  instructions: null,
  avatarUrl: null,
  generationSettings: {
    modelSettings: {
      modelId: GPT_4_TURBO_MODEL_CONFIG.modelId,
      providerId: GPT_4_TURBO_MODEL_CONFIG.providerId,
    },
    temperature: 0.7,
  },
};
