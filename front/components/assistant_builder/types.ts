import { CircleIcon, SquareIcon, TriangleIcon } from "@dust-tt/sparkle";
import type {
  AgentConfigurationScope,
  AppType,
  ContentNode,
  DataSourceType,
  PlanType,
  ProcessSchemaPropertyType,
  SubscriptionType,
  SupportedModel,
  TimeframeUnit,
  WorkspaceType,
} from "@dust-tt/types";
import {
  assertNever,
  CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG,
} from "@dust-tt/types";

import {
  DEFAULT_PROCESS_ACTION_NAME,
  DEFAULT_RETRIEVAL_ACTION_NAME,
  DEFAULT_RETRIEVAL_NO_QUERY_ACTION_NAME,
  DEFAULT_TABLES_QUERY_ACTION_NAME,
  DEFAULT_WEBSEARCH_ACTION_NAME,
} from "@app/lib/api/assistant/actions/names";
import type { FetchAssistantTemplateResponse } from "@app/pages/api/w/[wId]/assistant/builder/templates/[tId]";

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

export type AssistantBuilderTagsFilter = {
  in: string[];
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
  tagsFilter: AssistantBuilderTagsFilter | null;
  schema: ProcessSchemaPropertyType[];
};

// Websearch configuration
export type AssistantBuilderWebNavigationConfiguration = Record<string, never>; // no relevant params identified yet

export type AssistantBuilderVisualizationConfiguration = Record<string, never>; // no relevant params identified yet

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
  | {
      type: "WEB_NAVIGATION";
      configuration: AssistantBuilderWebNavigationConfiguration;
    }
) & {
  name: string;
  description: string;
  noConfigurationRequired?: boolean;
};

export type TemplateActionType = Omit<
  AssistantBuilderActionConfiguration,
  "configuration"
> & {
  help: string;
};

export type AssistantBuilderActionType =
  AssistantBuilderActionConfiguration["type"];

export type AssistantBuilderSetActionType =
  | {
      action: AssistantBuilderActionConfiguration;
      type: "insert" | "edit" | "pending";
    }
  | {
      action: AssistantBuilderActionConfiguration;
      type: "pending";
    }
  | {
      type: "clear_pending";
    };

export type AssistantBuilderPendingAction =
  | {
      action: AssistantBuilderActionConfiguration;
      previousActionName: string | null;
    }
  | {
      action: null;
    };

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
  maxStepsPerRun: number | null;
  templateId: string | null;
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
  maxStepsPerRun: number | null;
  templateId: string | null;
};

// Creates a fresh instance of AssistantBuilderState to prevent unintended mutations of shared state.
export function getDefaultAssistantState() {
  return {
    actions: [],
    handle: null,
    scope: "private",
    description: null,
    instructions: null,
    avatarUrl: null,
    generationSettings: {
      modelSettings: {
        modelId: CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG.modelId,
        providerId: CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG.providerId,
      },
      temperature: 0.7,
    },
    maxStepsPerRun: 3,
    templateId: null,
  } satisfies AssistantBuilderState;
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
    name: DEFAULT_RETRIEVAL_ACTION_NAME,
    description: "",
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
    name: DEFAULT_RETRIEVAL_NO_QUERY_ACTION_NAME,
    description: "",
  } satisfies AssistantBuilderActionConfiguration;
}

export const ASSISTANT_BUILDER_DUST_APP_RUN_ACTION_CONFIGURATION_DEFAULT_NAME =
  "run_dust_app";
export const ASSISTANT_BUILDER_DUST_APP_RUN_ACTION_CONFIGURATION_DEFAULT_DESCRIPTION =
  "Run a Dust app.";

export function getDefaultDustAppRunActionConfiguration() {
  return {
    type: "DUST_APP_RUN",
    configuration: {
      app: null,
    } as AssistantBuilderDustAppConfiguration,
    name: ASSISTANT_BUILDER_DUST_APP_RUN_ACTION_CONFIGURATION_DEFAULT_NAME,
    description:
      ASSISTANT_BUILDER_DUST_APP_RUN_ACTION_CONFIGURATION_DEFAULT_DESCRIPTION,
  } satisfies AssistantBuilderActionConfiguration;
}

export function getDefaultTablesQueryActionConfiguration() {
  return {
    type: "TABLES_QUERY",
    configuration: {} as AssistantBuilderTablesQueryConfiguration,
    name: DEFAULT_TABLES_QUERY_ACTION_NAME,
    description: "",
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
      tagsFilter: null,
      schema: [],
    } as AssistantBuilderProcessConfiguration,
    name: DEFAULT_PROCESS_ACTION_NAME,
    description: "",
  } satisfies AssistantBuilderActionConfiguration;
}

export function getDefaultWebsearchActionConfiguration(): AssistantBuilderActionConfiguration {
  return {
    type: "WEB_NAVIGATION",
    configuration: {},
    name: DEFAULT_WEBSEARCH_ACTION_NAME,
    description: "Perform a web search and/or browse a page content.",
    noConfigurationRequired: true,
  };
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
    case "WEB_NAVIGATION":
      return getDefaultWebsearchActionConfiguration();
    default:
      assertNever(actionType);
  }
}

export const BUILDER_FLOWS = [
  "workspace_assistants",
  "personal_assistants",
] as const;
export type BuilderFlow = (typeof BUILDER_FLOWS)[number];

export type AssistantBuilderProps = {
  owner: WorkspaceType;
  subscription: SubscriptionType;
  plan: PlanType;
  gaTrackingId: string;
  dataSources: DataSourceType[];
  dustApps: AppType[];
  initialBuilderState: AssistantBuilderInitialState | null;
  agentConfigurationId: string | null;
  flow: BuilderFlow;
  defaultIsEdited?: boolean;
  baseUrl: string;
  defaultTemplate: FetchAssistantTemplateResponse | null;
};

export const BUILDER_SCREENS = {
  instructions: {
    label: "Instructions",
    icon: CircleIcon,
  },
  actions: {
    label: "Tools & Data sources",
    icon: SquareIcon,
  },
  naming: { label: "Naming", icon: TriangleIcon },
};
export type BuilderScreen = keyof typeof BUILDER_SCREENS;
