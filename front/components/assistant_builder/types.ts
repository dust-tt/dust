import type { Icon } from "@dust-tt/sparkle";
import { CircleIcon, SquareIcon, TriangleIcon } from "@dust-tt/sparkle";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { uniqueId } from "lodash";
import type React from "react";
import type { SVGProps } from "react";

import {
  DEFAULT_DATA_VISUALIZATION_DESCRIPTION,
  DEFAULT_DATA_VISUALIZATION_NAME,
  DEFAULT_MCP_ACTION_NAME,
  DEFAULT_PROCESS_ACTION_NAME,
  DEFAULT_REASONING_ACTION_DESCRIPTION,
  DEFAULT_REASONING_ACTION_NAME,
  DEFAULT_RETRIEVAL_ACTION_NAME,
  DEFAULT_RETRIEVAL_NO_QUERY_ACTION_NAME,
  DEFAULT_TABLES_QUERY_ACTION_NAME,
  DEFAULT_WEBSEARCH_ACTION_NAME,
} from "@app/lib/actions/constants";
import type { DustAppRunConfigurationType } from "@app/lib/actions/dust_app_run";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/utils";
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
  TimeFrame,
  TimeframeUnit,
  UserType,
  WhitelistableFeature,
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
  timeFrame: TimeFrame | null;
  additionalConfiguration: Record<string, boolean | number | string>;
  dustAppConfiguration: DustAppRunConfigurationType | null;
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

export interface AssistantBuilderDataVisualizationConfiguration {
  type: "DATA_VISUALIZATION";
  configuration: Record<string, never>;
  name: string;
  description: string;
  noConfigurationRequired: true;
}

// DATA_VISUALIZATION is not an action, but we need to show it in the UI like an action.
export type AssistantBuilderDataVisualizationConfigurationWithId =
  AssistantBuilderDataVisualizationConfiguration & {
    id: string;
  };

export type AssistantBuilderActionAndDataVisualizationConfiguration =
  | AssistantBuilderActionConfiguration
  | AssistantBuilderDataVisualizationConfiguration;

export type TemplateActionType = Omit<
  AssistantBuilderActionConfiguration,
  "configuration"
> & {
  help: string;
};

export type AssistantBuilderActionType =
  AssistantBuilderActionConfiguration["type"];

export type AssistantBuilderDataVisualizationType =
  AssistantBuilderDataVisualizationConfiguration["type"];

export type AssistantBuilderActionState =
  | AssistantBuilderActionConfigurationWithId
  | AssistantBuilderDataVisualizationConfigurationWithId;

export type AssistantBuilderSetActionType =
  | {
      action: AssistantBuilderActionState;
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
      action: AssistantBuilderActionState;
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
  actions: AssistantBuilderActionState[];
  maxStepsPerRun: number | null;
  visualizationEnabled: boolean;
  templateId: string | null;
  tags: TagType[];
  editors: UserType[];
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
  actions: AssistantBuilderActionAndDataVisualizationConfiguration[];
  maxStepsPerRun: number | null;
  visualizationEnabled: boolean;
  templateId: string | null;
  tags: TagType[];
  editors: UserType[];
};

export interface ActionSpecification {
  label: string;
  description: string;
  dropDownIcon: NonNullable<React.ComponentProps<typeof Icon>["visual"]>;
  cardIcon: NonNullable<React.ComponentProps<typeof Icon>["visual"]>;
  flag: WhitelistableFeature | null;
}

export type ActionSpecificationWithType = ActionSpecification & {
  type: AssistantBuilderActionType | "DATA_VISUALIZATION";
};

// Creates a fresh instance of AssistantBuilderState to prevent unintended mutations of shared state.
export function getDefaultAssistantState() {
  return {
    // Data Visualization is not an action but we show it like an action.
    // We enable it by default so we should push it to actions list.
    actions: [getDataVisualizationActionConfiguration()],
    handle: null,
    scope: "hidden",
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
    editors: [],
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
    // Old reasoning is actually configurable, but it is set to true (= non-configurable) because we have a special dropdown menu to configure and
    // we don't want to show the configuration modal. We will remove this and the dropdown when we fully switch to MCP.
    noConfigurationRequired: true,
    description: DEFAULT_REASONING_ACTION_DESCRIPTION,
  } satisfies AssistantBuilderActionConfiguration;
}

export function getDataVisualizationConfiguration(): AssistantBuilderDataVisualizationConfiguration {
  return {
    type: "DATA_VISUALIZATION",
    configuration: {},
    name: DEFAULT_DATA_VISUALIZATION_NAME,
    description: DEFAULT_DATA_VISUALIZATION_DESCRIPTION,
    noConfigurationRequired: true,
  } satisfies AssistantBuilderDataVisualizationConfiguration;
}

export function getDefaultMCPServerActionConfiguration(
  mcpServerView?: MCPServerViewType
): AssistantBuilderActionConfiguration {
  const requirements = getMCPServerRequirements(mcpServerView);

  return {
    type: "MCP",
    configuration: {
      mcpServerViewId: mcpServerView?.sId ?? "not-a-valid-sId",
      dataSourceConfigurations: null,
      tablesConfigurations: null,
      childAgentId: null,
      reasoningModel: null,
      timeFrame: null,
      additionalConfiguration: {},
      dustAppConfiguration: null,
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

export function getDataVisualizationActionConfiguration() {
  return {
    id: uniqueId(),
    ...getDataVisualizationConfiguration(),
  };
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

export const BUILDER_SCREENS = ["instructions", "actions", "settings"] as const;

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
    settings: {
      id: "settings",
      label: "Settings",
      dataGtm: {
        label: "assistantNamingButton",
        location: "assistantBuilder",
      },
      icon: TriangleIcon,
    },
  };
