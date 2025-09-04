import type { Icon } from "@dust-tt/sparkle";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import uniqueId from "lodash/uniqueId";
import type React from "react";

import {
  DEFAULT_DATA_VISUALIZATION_DESCRIPTION,
  DEFAULT_DATA_VISUALIZATION_NAME,
} from "@app/lib/actions/constants";
import { getMcpServerViewDescription } from "@app/lib/actions/mcp_helper";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { AdditionalConfigurationType } from "@app/lib/models/assistant/actions/mcp";
import type {
  AgentConfigurationScope,
  AgentReasoningEffort,
  DataSourceViewSelectionConfigurations,
  DustAppRunConfigurationType,
  ReasoningModelConfigurationType,
  SupportedModel,
  TimeFrame,
  UserType,
  WhitelistableFeature,
} from "@app/types";
import { CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG } from "@app/types";
import type { TagType } from "@app/types/tag";

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
  configuration: null;
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

export type AssistantBuilderMCPServerType =
  AssistantBuilderMCPConfiguration["type"];

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

export function getDataVisualizationConfiguration(): AssistantBuilderDataVisualizationConfiguration {
  return {
    type: "DATA_VISUALIZATION",
    configuration: null,
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

export function getDataVisualizationActionConfiguration() {
  return {
    id: uniqueId(),
    ...getDataVisualizationConfiguration(),
  };
}
