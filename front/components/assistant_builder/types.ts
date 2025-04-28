import { CircleIcon, SquareIcon, TriangleIcon } from "@dust-tt/sparkle";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { uniqueId } from "lodash";
import type React from "react";
import type { SVGProps } from "react";

import {
  DEFAULT_MCP_ACTION_NAME,
  DEFAULT_PROCESS_ACTION_NAME,
  DEFAULT_REASONING_ACTION_DESCRIPTION,
  DEFAULT_REASONING_ACTION_NAME,
  DEFAULT_RETRIEVAL_ACTION_NAME,
  DEFAULT_RETRIEVAL_NO_QUERY_ACTION_NAME,
  DEFAULT_TABLES_QUERY_ACTION_NAME,
  DEFAULT_WEBSEARCH_ACTION_NAME,
} from "@app/lib/actions/constants";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { ReasoningModelConfiguration } from "@app/lib/actions/reasoning";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { FetchAssistantTemplateResponse } from "@app/pages/api/templates/[tId]";
import type {
  AgentConfigurationScope,
  AgentReasoningEffort,
  AppType,
  DataSourceViewSelectionConfigurations,
  ModelIdType,
  ModelProviderIdType,
  PlanType,
  SubscriptionType,
  SupportedModel,
  TimeframeUnit,
  WorkspaceType,
} from "@app/types";
import {
  assertNever,
  CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG,
  DEFAULT_MAX_STEPS_USE_PER_RUN,
} from "@app/types";
import type { TagType } from "@app/types/tag";

export const ACTION_MODES = [
  "GENERIC",
  "RETRIEVAL_SEARCH",
  "RETRIEVAL_EXHAUSTIVE",
  "DUST_APP_RUN",
  "TABLES_QUERY",
  "PROCESS",
] as const;

export function isDefaultActionName(
  action: AssistantBuilderActionConfiguration
) {
  const actionType = action.type;

  switch (actionType) {
    case "RETRIEVAL_SEARCH":
      return action.name.includes(DEFAULT_RETRIEVAL_ACTION_NAME);
    case "RETRIEVAL_EXHAUSTIVE":
      return action.name.includes(DEFAULT_RETRIEVAL_NO_QUERY_ACTION_NAME);
    case "DUST_APP_RUN":
      return action.name.includes(
        ASSISTANT_BUILDER_DUST_APP_RUN_ACTION_CONFIGURATION_DEFAULT_NAME
      );
    case "TABLES_QUERY":
      return action.name.includes(DEFAULT_TABLES_QUERY_ACTION_NAME);
    case "PROCESS":
      return action.name.includes(DEFAULT_PROCESS_ACTION_NAME);
    case "WEB_NAVIGATION":
      return action.name.includes(DEFAULT_WEBSEARCH_ACTION_NAME);
    case "REASONING":
      return action.name.includes(DEFAULT_REASONING_ACTION_NAME);
    case "MCP":
      return action.name.includes(DEFAULT_MCP_ACTION_NAME);
    default:
      assertNever(actionType);
  }
}

// Retrieval configuration

export type AssistantBuilderTimeFrame = {
  value: number;
  unit: TimeframeUnit;
};

export type AssistantBuilderTagsFilter = {
  in: string[];
};

export type AssistantBuilderRetrievalConfiguration = {
  dataSourceConfigurations: DataSourceViewSelectionConfigurations;
};

export type AssistantBuilderRetrievalExhaustiveConfiguration = {
  timeFrame?: AssistantBuilderTimeFrame | null;
} & AssistantBuilderRetrievalConfiguration;

// DustAppRun configuration

export type AssistantBuilderDustAppConfiguration = {
  app: AppType | null;
};

// TablesQuery configuration

export type AssistantBuilderTableConfiguration =
  DataSourceViewSelectionConfigurations;

// Process configuration

export type AssistantBuilderProcessConfiguration = {
  timeFrame?: AssistantBuilderTimeFrame | null;
} & {
  dataSourceConfigurations: DataSourceViewSelectionConfigurations;
  tagsFilter: AssistantBuilderTagsFilter | null;
  jsonSchema: JSONSchema | null;
  _jsonSchemaString?: string | null;
};

// Websearch configuration (no configuration)
export type AssistantBuilderWebNavigationConfiguration = Record<string, never>;

// Reasoning configuration
export type AssistantBuilderReasoningConfiguration = {
  modelId: ModelIdType | null;
  providerId: ModelProviderIdType | null;
  temperature: number | null;
  reasoningEffort: AgentReasoningEffort | null;
};

// MCP configuration
export type AssistantBuilderMCPServerConfiguration = {
  mcpServerViewId: string;
  dataSourceConfigurations: DataSourceViewSelectionConfigurations | null;
  tablesConfigurations: DataSourceViewSelectionConfigurations | null;
  childAgentId: string | null;
  reasoningModel: ReasoningModelConfiguration | null;
  additionalConfiguration: Record<string, boolean | number | string>;
};

// Builder State

export type AssistantBuilderActionConfiguration = (
  | {
      type: "RETRIEVAL_SEARCH";
      configuration: AssistantBuilderRetrievalConfiguration;
    }
  | {
      type: "RETRIEVAL_EXHAUSTIVE";
      configuration: AssistantBuilderRetrievalExhaustiveConfiguration;
    }
  | {
      type: "DUST_APP_RUN";
      configuration: AssistantBuilderDustAppConfiguration;
    }
  | {
      type: "TABLES_QUERY";
      configuration: AssistantBuilderTableConfiguration;
    }
  | {
      type: "PROCESS";
      configuration: AssistantBuilderProcessConfiguration;
    }
  | {
      type: "WEB_NAVIGATION";
      configuration: AssistantBuilderWebNavigationConfiguration;
    }
  | {
      type: "REASONING";
      configuration: AssistantBuilderReasoningConfiguration;
    }
  | {
      type: "MCP";
      configuration: AssistantBuilderMCPServerConfiguration;
    }
) & {
  name: string;
  description: string;
  noConfigurationRequired?: boolean;
};

export type AssistantBuilderActionConfigurationWithId =
  AssistantBuilderActionConfiguration & {
    id: string;
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
      action: AssistantBuilderActionConfigurationWithId;
      type: "insert" | "edit" | "pending";
    }
  | {
      action: AssistantBuilderActionConfigurationWithId;
      type: "pending";
    }
  | {
      type: "clear_pending";
    };

export type AssistantBuilderPendingAction =
  | {
      action: AssistantBuilderActionConfigurationWithId;
      previousActionName: string | null;
    }
  | {
      action: null;
      previousActionName: null;
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
    responseFormat?: string;
  };
  actions: Array<AssistantBuilderActionConfigurationWithId>;
  maxStepsPerRun: number | null;
  visualizationEnabled: boolean;
  templateId: string | null;
  tags: TagType[];
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
    responseFormat?: string;
  } | null;
  actions: Array<AssistantBuilderActionConfiguration>;
  maxStepsPerRun: number | null;
  visualizationEnabled: boolean;
  templateId: string | null;
  tags: TagType[];
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
    maxStepsPerRun: DEFAULT_MAX_STEPS_USE_PER_RUN,
    visualizationEnabled: true,
    templateId: null,
    tags: [],
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
      timeFrame: null,
    } as AssistantBuilderRetrievalExhaustiveConfiguration,
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
    configuration: {} as AssistantBuilderTableConfiguration,
    name: DEFAULT_TABLES_QUERY_ACTION_NAME,
    description: "",
  } satisfies AssistantBuilderActionConfiguration;
}

export function getDefaultProcessActionConfiguration() {
  return {
    type: "PROCESS",
    configuration: {
      dataSourceConfigurations: {},
      timeFrame: null,
      tagsFilter: null,
      jsonSchema: null,
      _jsonSchemaString: null,
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

export function getDefaultReasoningActionConfiguration(): AssistantBuilderActionConfiguration {
  return {
    type: "REASONING",
    configuration: {
      providerId: null,
      modelId: null,
      temperature: null,
      reasoningEffort: null,
    },
    name: DEFAULT_REASONING_ACTION_NAME,
    description: DEFAULT_REASONING_ACTION_DESCRIPTION,
    noConfigurationRequired: false,
  } satisfies AssistantBuilderActionConfiguration;
}

export function getDefaultMCPServerActionConfiguration(
  mcpServerView?: MCPServerViewType
): AssistantBuilderActionConfiguration {
  const requirements = getMCPServerRequirements(mcpServerView);

  return {
    type: "MCP",
    configuration: {
      mcpServerViewId: mcpServerView?.id ?? "not-a-valid-sId",
      dataSourceConfigurations: null,
      tablesConfigurations: null,
      childAgentId: null,
      reasoningModel: null,
      additionalConfiguration: {},
    },
    name: mcpServerView?.server.name ?? "",
    description:
      requirements.requiresDataSourceConfiguration ||
      requirements.requiresTableConfiguration
        ? ""
        : mcpServerView?.server.description ?? "",
    noConfigurationRequired: requirements.noRequirement,
  };
}
export function getDefaultActionConfiguration(
  actionType: AssistantBuilderActionType | null
): AssistantBuilderActionConfigurationWithId | null {
  const config = (() => {
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
      case "REASONING":
        return getDefaultReasoningActionConfiguration();
      case "MCP":
        return getDefaultMCPServerActionConfiguration();
      default:
        assertNever(actionType);
    }
  })();

  if (config) {
    return {
      id: uniqueId(),
      ...config,
    };
  }

  return null;
}

export const BUILDER_FLOWS = [
  "workspace_assistants",
  "personal_assistants",
] as const;
export type BuilderFlow = (typeof BUILDER_FLOWS)[number];

export type AssistantBuilderProps = {
  agentConfigurationId: string | null;
  baseUrl: string;
  defaultIsEdited?: boolean;
  defaultTemplate: FetchAssistantTemplateResponse | null;
  flow: BuilderFlow;
  initialBuilderState: AssistantBuilderInitialState | null;
  owner: WorkspaceType;
  plan: PlanType;
  subscription: SubscriptionType;
};

export const BUILDER_SCREENS = ["instructions", "actions", "naming"] as const;

export type BuilderScreen = (typeof BUILDER_SCREENS)[number];

type BuilderScreenInfos = {
  id: string;
  label: string;
  icon: (props: SVGProps<SVGSVGElement>) => React.JSX.Element;
  dataGtm: {
    label: string;
    location: string;
  };
};

export const BUILDER_SCREENS_INFOS: Record<BuilderScreen, BuilderScreenInfos> =
  {
    instructions: {
      id: "instructions",
      label: "Instructions",
      dataGtm: {
        label: "assistantInstructionsButton",
        location: "assistantBuilder",
      },
      icon: CircleIcon,
    },
    actions: {
      id: "actions",
      label: "Tools & Knowledge",
      dataGtm: {
        label: "assistantToolsButton",
        location: "assistantBuilder",
      },
      icon: SquareIcon,
    },
    naming: {
      id: "naming",
      label: "Naming",
      dataGtm: {
        label: "assistantNamingButton",
        location: "assistantBuilder",
      },
      icon: TriangleIcon,
    },
  };
