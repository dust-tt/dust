import type { Icon } from "@dust-tt/sparkle";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import uniqueId from "lodash/uniqueId";
import type React from "react";

import type { AgentBuilderTriggerType } from "@app/components/agent_builder/AgentBuilderFormContext";
import {
  DEFAULT_DATA_VISUALIZATION_DESCRIPTION,
  DEFAULT_DATA_VISUALIZATION_NAME,
} from "@app/lib/actions/constants";
import { getMcpServerViewDescription } from "@app/lib/actions/mcp_helper";
import { getMCPServerToolsConfigurations } from "@app/lib/actions/mcp_internal_actions/input_configuration";
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
import type { TagType } from "@app/types/tag";

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
  secretName: string | null;
};

export type AssistantBuilderMCPConfiguration = {
  type: "MCP";
  configuration: AssistantBuilderMCPServerConfiguration;
  name: string;
  description: string;
  configurable?: boolean;
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
  configurable: false;
}

// DATA_VISUALIZATION is not an action, but we need to show it in the UI like an action.
export type AssistantBuilderDataVisualizationConfigurationWithId =
  AssistantBuilderDataVisualizationConfiguration & {
    id: string;
  };

export type AssistantBuilderMCPOrVizState =
  | AssistantBuilderMCPConfigurationWithId
  | AssistantBuilderDataVisualizationConfigurationWithId;

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
  triggers: AgentBuilderTriggerType[];
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

function getDataVisualizationConfiguration(): AssistantBuilderDataVisualizationConfiguration {
  return {
    type: "DATA_VISUALIZATION",
    configuration: null,
    name: DEFAULT_DATA_VISUALIZATION_NAME,
    description: DEFAULT_DATA_VISUALIZATION_DESCRIPTION,
    configurable: false,
  } satisfies AssistantBuilderDataVisualizationConfiguration;
}

export function getDefaultMCPServerActionConfiguration(
  mcpServerView?: MCPServerViewType
): AssistantBuilderMCPConfiguration {
  const toolsConfigurations = getMCPServerToolsConfigurations(mcpServerView);

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
      secretName: null,
    },
    name: mcpServerView?.name ?? mcpServerView?.server.name ?? "",
    description:
      toolsConfigurations.dataSourceConfiguration ??
      toolsConfigurations.dataWarehouseConfiguration ??
      toolsConfigurations.tableConfiguration ??
      false
        ? ""
        : mcpServerView
          ? getMcpServerViewDescription(mcpServerView)
          : "",
    configurable: toolsConfigurations.configurable !== "no",
  };
}

export function getDataVisualizationActionConfiguration() {
  return {
    id: uniqueId(),
    ...getDataVisualizationConfiguration(),
  };
}
