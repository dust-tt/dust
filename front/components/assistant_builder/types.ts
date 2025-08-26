import type { Icon } from "@dust-tt/sparkle";
import { CircleIcon, SquareIcon, TriangleIcon } from "@dust-tt/sparkle";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import uniqueId from "lodash/uniqueId";
import type React from "react";
import type { SVGProps } from "react";

import {
  DEFAULT_DATA_VISUALIZATION_DESCRIPTION,
  DEFAULT_DATA_VISUALIZATION_NAME,
  DEFAULT_MCP_ACTION_NAME,
} from "@app/lib/actions/constants";
import { getMcpServerViewDescription } from "@app/lib/actions/mcp_helper";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { AdditionalConfigurationType } from "@app/lib/models/assistant/actions/mcp";
import type { FetchAssistantTemplateResponse } from "@app/pages/api/templates/[tId]";
import type {
  AgentConfigurationScope,
  AgentConfigurationType,
  AgentReasoningEffort,
  DataSourceViewSelectionConfigurations,
  DustAppRunConfigurationType,
  LightAgentConfigurationType,
  ReasoningModelConfigurationType,
  SubscriptionType,
  SupportedModel,
  TimeFrame,
  TimeframeUnit,
  UserType,
  WhitelistableFeature,
  WorkspaceType,
} from "@app/types";
import { CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG } from "@app/types";
import type { TagType } from "@app/types/tag";

export const ACTION_MODES = [
  "GENERIC",
  "RETRIEVAL_SEARCH",
  "RETRIEVAL_EXHAUSTIVE",
  "DUST_APP_RUN",
  "TABLES_QUERY",
  "PROCESS",
] as const;

export function isDefaultActionName(action: AssistantBuilderMCPConfiguration) {
  return action.name.includes(DEFAULT_MCP_ACTION_NAME);
}

// Retrieval configuration

export type AssistantBuilderTimeFrame = {
  value: number;
  unit: TimeframeUnit;
};

export type AssistantBuilderTagsFilter = {
  in: string[];
};

export type AssistantBuilderTriggerType = {
  sId?: string;
  name: string;
  kind: "schedule";
  customPrompt: string | null;
  editor: UserType["id"] | null;
  configuration: {
    cron: string;
    timezone: string;
  } | null;
};

// MCP configuration
export type AssistantBuilderMCPServerConfiguration = {
  mcpServerViewId: string;
  dataSourceConfigurations: DataSourceViewSelectionConfigurations | null;
  tablesConfigurations: DataSourceViewSelectionConfigurations | null;
  childAgentId: string | null;
  reasoningModel: ReasoningModelConfigurationType | null;
  timeFrame: TimeFrame | null;
  additionalConfiguration: AdditionalConfigurationType;
  dustAppConfiguration: DustAppRunConfigurationType | null;
  jsonSchema: JSONSchema | null;
  _jsonSchemaString: string | null;
};

// Builder State

export type AssistantBuilderMCPConfiguration = {
  type: "MCP";
  configuration: AssistantBuilderMCPServerConfiguration;
  name: string;
  description: string;
  noConfigurationRequired?: boolean;
};

export type AssistantBuilderMCPConfigurationWithId =
  AssistantBuilderMCPConfiguration & {
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
  | AssistantBuilderMCPConfiguration
  | AssistantBuilderDataVisualizationConfiguration;

export type TemplateActionType = Omit<
  AssistantBuilderMCPConfiguration,
  "configuration"
> & {
  help: string;
};

export type AssistantBuilderMCPServerType =
  AssistantBuilderMCPConfiguration["type"];

export type AssistantBuilderDataVisualizationType =
  AssistantBuilderDataVisualizationConfiguration["type"];

export type AssistantBuilderMCPOrVizState =
  | AssistantBuilderMCPConfigurationWithId
  | AssistantBuilderDataVisualizationConfigurationWithId;

export type AssistantBuilderSetActionType =
  | {
      action: AssistantBuilderMCPOrVizState;
      type: "insert" | "edit" | "pending";
    }
  | {
      action: AssistantBuilderMCPConfigurationWithId;
      type: "pending";
    }
  | {
      type: "clear_pending";
    };

export type AssistantBuilderPendingAction =
  | {
      action: AssistantBuilderMCPOrVizState;
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
    reasoningEffort: AgentReasoningEffort;
    responseFormat?: string;
  };
  actions: AssistantBuilderMCPOrVizState[];
  triggers: AssistantBuilderTriggerType[];
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
    reasoningEffort: AgentReasoningEffort;
    responseFormat?: string;
  } | null;
  actions: AssistantBuilderActionAndDataVisualizationConfiguration[];
  triggers: AssistantBuilderTriggerType[];
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
  type: AssistantBuilderMCPServerType | "DATA_VISUALIZATION";
};

// Creates a fresh instance of AssistantBuilderState to prevent unintended mutations of shared state.
export function getDefaultAssistantState() {
  return {
    actions: [],
    triggers: [],
    handle: null,
    scope: "hidden",
    description: null,
    instructions: null,
    avatarUrl: null,
    generationSettings: {
      modelSettings: {
        modelId: CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG.modelId,
        providerId: CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG.providerId,
      },
      temperature: 0.7,
      reasoningEffort:
        CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG.defaultReasoningEffort,
    },
    visualizationEnabled: false,
    templateId: null,
    tags: [],
    editors: [],
  } satisfies AssistantBuilderState;
}

export const ASSISTANT_BUILDER_DUST_APP_RUN_ACTION_CONFIGURATION_DEFAULT_NAME =
  "run_dust_app";
export const ASSISTANT_BUILDER_DUST_APP_RUN_ACTION_CONFIGURATION_DEFAULT_DESCRIPTION =
  "Run a Dust app.";

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
): AssistantBuilderMCPConfiguration {
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
      jsonSchema: null,
      _jsonSchemaString: null,
    },
    name: mcpServerView?.name ?? mcpServerView?.server.name ?? "",
    description:
      requirements.requiresDataSourceConfiguration ||
      requirements.requiresDataWarehouseConfiguration ||
      requirements.requiresTableConfiguration
        ? ""
        : mcpServerView
          ? getMcpServerViewDescription(mcpServerView)
          : "",
    noConfigurationRequired: requirements.noRequirement,
  };
}

export function getDefaultMCPServerConfigurationWithId(
  mcpServerView?: MCPServerViewType
): AssistantBuilderMCPConfigurationWithId {
  const config = getDefaultMCPServerActionConfiguration(mcpServerView);

  return {
    id: uniqueId(),
    ...config,
  };
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

type AssistantBuilderPropsBase<T> = {
  agentConfiguration: T | null;
  baseUrl: string;
  defaultTemplate: FetchAssistantTemplateResponse | null;
  flow: BuilderFlow;
  initialBuilderState: AssistantBuilderInitialState | null;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  duplicateAgentId?: string | null;
};

export type AssistantBuilderProps =
  AssistantBuilderPropsBase<AgentConfigurationType>;
export type AssistantBuilderLightProps =
  AssistantBuilderPropsBase<LightAgentConfigurationType>;

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
