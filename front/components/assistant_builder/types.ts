import type {
  AgentConfigurationScope,
  AppType,
  ContentNode,
  DataSourceType,
  ProcessSchemaPropertyType,
  SupportedModel,
  TimeframeUnit,
} from "@dust-tt/types";
import { assertNever, GPT_4_TURBO_MODEL_CONFIG } from "@dust-tt/types";

export const ACTION_MODES = [
  "GENERIC",
  "RETRIEVAL_SEARCH",
  "RETRIEVAL_EXHAUSTIVE",
  "DUST_APP_RUN",
  "TABLES_QUERY",
  "PROCESS",
] as const;

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

export type AssistantBuilderActionConfiguration = (
  | {
      type: "RETRIEVAL_SEARCH" | "RETRIEVAL_EXHAUSTIVE";
      configuration: AssistantBuilderRetrievalConfiguration;
    }
  | {
      type: "DUST_APP_RUN";
      configuration: AssistantBuilderDustAppConfiguration;
    }
  | {
      type: "TABLES_QUERY";
      configuration: AssistantBuilderTablesQueryConfiguration;
    }
  | {
      type: "PROCESS";
      configuration: AssistantBuilderProcessConfiguration;
    }
) & {
  name: string;
  description: string;
};

export type AssistantBuilderActionType =
  AssistantBuilderActionConfiguration["type"];

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
  actions: Array<AssistantBuilderActionConfiguration>;
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
  actions: Array<AssistantBuilderActionConfiguration>;
};

// Creates a fresh instance of AssistantBuilderState to prevent unintended mutations of shared state.
export function getDefaultAssistantState(): AssistantBuilderState {
  return {
    actions: [],
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
}

export function getDefaultRetrievalSearchActionConfiguration() {
  return {
    type: "RETRIEVAL_SEARCH",
    configuration: {
      dataSourceConfigurations: {},
      timeFrame: {
        value: 1,
        unit: "month",
      },
    } as AssistantBuilderRetrievalConfiguration,
    name: "search_data_sources",
    description: "Search in the user's data sources.",
  } satisfies AssistantBuilderActionConfiguration;
}

export function getDefaultRetrievalExhaustiveActionConfiguration() {
  return {
    type: "RETRIEVAL_EXHAUSTIVE",
    configuration: {
      dataSourceConfigurations: {},
      timeFrame: {
        value: 1,
        unit: "month",
      },
    } as AssistantBuilderRetrievalConfiguration,
    name: "recent_data_sources",
    description: "Retrieve the most recent data from the user's data sources.",
  } satisfies AssistantBuilderActionConfiguration;
}

export function getDefaultDustAppRunActionConfiguration() {
  return {
    type: "DUST_APP_RUN",
    configuration: {
      app: null,
    } as AssistantBuilderDustAppConfiguration,
    name: "run_dust_app",
    description: "Run a Dust app.",
  } satisfies AssistantBuilderActionConfiguration;
}

export function getDefaultTablesQueryActionConfiguration() {
  return {
    type: "TABLES_QUERY",
    configuration: {} as AssistantBuilderTablesQueryConfiguration,
    name: "query_tables",
    description: "Query structured tables via SQL.",
  } satisfies AssistantBuilderActionConfiguration;
}

export function getDefaultProcessActionConfiguration() {
  return {
    type: "PROCESS",
    configuration: {
      dataSourceConfigurations: {},
      timeFrame: {
        value: 1,
        unit: "day",
      },
      schema: [],
    } as AssistantBuilderProcessConfiguration,
    name: "process_data",
    description: "Process data.",
  } satisfies AssistantBuilderActionConfiguration;
}

export function getDefaultActionConfiguration(
  actionType: AssistantBuilderActionType | null
): AssistantBuilderActionConfiguration | null {
  switch (actionType) {
    case null:
      return null;
    case "RETRIEVAL_SEARCH":
      return getDefaultRetrievalSearchActionConfiguration();
    case "RETRIEVAL_EXHAUSTIVE":
      return getDefaultRetrievalExhaustiveActionConfiguration();
    case "DUST_APP_RUN":
      return getDefaultDustAppRunActionConfiguration();
    case "TABLES_QUERY":
      return getDefaultTablesQueryActionConfiguration();
    case "PROCESS":
      return getDefaultProcessActionConfiguration();
    default:
      assertNever(actionType);
  }
}
