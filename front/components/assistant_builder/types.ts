import { CircleIcon, SquareIcon, TriangleIcon } from "@dust-tt/sparkle";
import type {
  AgentConfigurationScope,
  AppType,
  DataSourceViewSelectionConfigurations,
  PlanType,
  ProcessSchemaPropertyType,
  SubscriptionType,
  SupportedModel,
  TimeframeUnit,
  WorkspaceType,
} from "@dust-tt/types";
import { DEFAULT_MAX_STEPS_USE_PER_RUN } from "@dust-tt/types";
import {
  assertNever,
  CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG,
} from "@dust-tt/types";
import { uniqueId } from "lodash";
import type { SVGProps } from "react";
import type React from "react";

import {
  DEFAULT_PROCESS_ACTION_NAME,
  DEFAULT_RETRIEVAL_ACTION_NAME,
  DEFAULT_RETRIEVAL_NO_QUERY_ACTION_NAME,
  DEFAULT_TABLES_QUERY_ACTION_NAME,
  DEFAULT_WEBSEARCH_ACTION_NAME,
} from "@app/lib/api/assistant/actions/constants";
import type { FetchAssistantTemplateResponse } from "@app/pages/api/w/[wId]/assistant/builder/templates/[tId]";

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
  switch (action.type) {
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
    default:
      return false;
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
  timeFrame: AssistantBuilderTimeFrame;
} & {
  dataSourceConfigurations: DataSourceViewSelectionConfigurations;
  tagsFilter: AssistantBuilderTagsFilter | null;
  schema: ProcessSchemaPropertyType[];
};

// Websearch configuration
export type AssistantBuilderWebNavigationConfiguration = Record<string, never>; // no relevant params identified yet

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
  actions: Array<AssistantBuilderActionConfigurationWithId>;
  maxStepsPerRun: number | null;
  visualizationEnabled: boolean;
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
  visualizationEnabled: boolean;
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
    maxStepsPerRun: DEFAULT_MAX_STEPS_USE_PER_RUN,
    visualizationEnabled: true,
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
};

export const BUILDER_SCREENS_INFOS: Record<BuilderScreen, BuilderScreenInfos> =
  {
    instructions: {
      id: "instructions",
      label: "Instructions",
      icon: CircleIcon,
    },
    actions: {
      id: "actions",
      label: "Tools & Data sources",
      icon: SquareIcon,
    },
    naming: {
      id: "naming",
      label: "Naming",
      icon: TriangleIcon,
    },
  };
