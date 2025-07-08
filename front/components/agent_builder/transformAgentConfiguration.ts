import type { AgentBuilderAction, AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import { isInternalMCPServerOfName } from "@app/lib/actions/mcp_internal_actions/constants";
import type { AgentActionConfigurationType } from "@app/lib/actions/types/agent";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration";
import type { DataSourceViewSelectionConfigurations, UserType } from "@app/types";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { DEFAULT_MAX_STEPS_USE_PER_RUN } from "@app/types/assistant/agent";
import { GPT_4O_MODEL_CONFIG } from "@app/types/assistant/assistant";
import type { DataSourceViewContentNode, DataSourceViewType } from "@app/types/data_source_view";

// Type for the supported action types that can be transformed from MCP server configurations
type SupportedAgentBuilderActionType = "EXTRACT_DATA" | "SEARCH" | "INCLUDE_DATA";

export function transformAgentConfigurationToFormData(
  agentConfiguration: AgentConfigurationType,
  currentUser: UserType,
  agentEditors: UserType[] = []
): AgentBuilderFormData {
  return {
    agentSettings: {
      name: agentConfiguration.name,
      description: agentConfiguration.description,
      pictureUrl: agentConfiguration.pictureUrl || "",
      scope:
        agentConfiguration.scope === "global"
          ? "visible"
          : agentConfiguration.scope,
      editors: agentEditors.length > 0 ? agentEditors : [currentUser],
      slackProvider: null, // TODO: determine from agent configuration
      slackChannels: [], // TODO: determine from agent configuration
      tags: agentConfiguration.tags || [],
    },
    instructions: agentConfiguration.instructions || "",
    generationSettings: {
      modelSettings: {
        modelId: agentConfiguration.model.modelId,
        providerId: agentConfiguration.model.providerId,
      },
      temperature: agentConfiguration.model.temperature,
      reasoningEffort: agentConfiguration.model.reasoningEffort || "none",
      responseFormat: agentConfiguration.model.responseFormat,
    },
    actions: transformActionsToFormData(
      agentConfiguration.actions || [],
      agentConfiguration.visualizationEnabled
    ),
    maxStepsPerRun:
      agentConfiguration.maxStepsPerRun || DEFAULT_MAX_STEPS_USE_PER_RUN,
  };
}

// Mapping of MCP server names to form action types
const MCP_SERVER_TO_ACTION_TYPE_MAP: Record<string, SupportedAgentBuilderActionType> = {
  extract_data: "EXTRACT_DATA",
  search: "SEARCH",
  include_data: "INCLUDE_DATA",
};

function transformActionsToFormData(
  actions: AgentActionConfigurationType[],
  visualizationEnabled: boolean = false
): AgentBuilderAction[] {
  const formActions: AgentBuilderAction[] = [];

  // Transform MCP server configurations to form actions
  for (const action of actions) {
    if (!isServerSideMCPServerConfiguration(action)) {
      continue;
    }

    // Find matching action type using our mapping
    const actionType = Object.entries(MCP_SERVER_TO_ACTION_TYPE_MAP).find(
      ([serverName]) =>
        isInternalMCPServerOfName(
          action.internalMCPServerId,
          serverName as keyof typeof MCP_SERVER_TO_ACTION_TYPE_MAP
        )
    )?.[1];

    if (actionType) {
      formActions.push(transformMCPServerConfigToAction(action, actionType));
    }
  }

  // Add data visualization action if enabled (this is stored as a flag, not an MCP config)
  if (visualizationEnabled) {
    formActions.push({
      id: "data_visualization",
      name: "Data Visualization",
      description: "Enable data visualization capabilities",
      type: "DATA_VISUALIZATION",
      noConfigurationRequired: true,
      configuration: {
        type: "DATA_VISUALIZATION",
      },
    });
  }

  return formActions;
}

function transformMCPServerConfigToAction(
  mcpConfig: ServerSideMCPServerConfigurationType,
  actionType: SupportedAgentBuilderActionType
): AgentBuilderAction {
  const dataSourceConfigurations = transformDataSourceConfigurations(
    mcpConfig.dataSources || []
  );

  const baseActionData = {
    id: mcpConfig.sId,
    name: mcpConfig.name,
    description: mcpConfig.description || "",
    noConfigurationRequired: false,
  };

  if (actionType === "EXTRACT_DATA") {
    return {
      ...baseActionData,
      type: "EXTRACT_DATA",
      configuration: {
        type: "EXTRACT_DATA",
        dataSourceConfigurations,
        timeFrame: mcpConfig.timeFrame,
        jsonSchema: mcpConfig.jsonSchema,
      },
    };
  } else if (actionType === "INCLUDE_DATA") {
    return {
      ...baseActionData,
      type: "INCLUDE_DATA",
      configuration: {
        type: "INCLUDE_DATA",
        dataSourceConfigurations,
        timeFrame: mcpConfig.timeFrame,
      },
    };
  } else {
    return {
      ...baseActionData,
      type: "SEARCH",
      configuration: {
        type: "SEARCH",
        dataSourceConfigurations,
      },
    };
  }
}

function transformDataSourceConfigurations(
  dataSources: DataSourceConfiguration[]
): DataSourceViewSelectionConfigurations {
  const configurations: DataSourceViewSelectionConfigurations = {};

  for (const ds of dataSources) {
    configurations[ds.dataSourceViewId] = {
      dataSourceView: {
        sId: ds.dataSourceViewId,
      } as DataSourceViewType,
      selectedResources:
        ds.filter?.parents?.in?.map((internalId: string) => ({
          internalId,
        })) as DataSourceViewContentNode[] || [],
      isSelectAll: !ds.filter?.parents,
      tagsFilter: ds.filter?.tags || null,
    };
  }

  return configurations;
}

export function getDefaultAgentFormData(
  user: UserType,
  defaultMaxSteps: number = DEFAULT_MAX_STEPS_USE_PER_RUN
): AgentBuilderFormData {
  return {
    agentSettings: {
      name: "",
      description: "",
      pictureUrl: "",
      scope: "hidden",
      editors: [user],
      slackProvider: null,
      slackChannels: [],
      tags: [],
    },
    instructions: "",
    generationSettings: {
      modelSettings: {
        modelId: GPT_4O_MODEL_CONFIG.modelId,
        providerId: GPT_4O_MODEL_CONFIG.providerId,
      },
      temperature: 0.7,
      reasoningEffort: GPT_4O_MODEL_CONFIG.defaultReasoningEffort || "none",
      responseFormat: undefined,
    },
    actions: [],
    maxStepsPerRun: defaultMaxSteps,
  };
}
