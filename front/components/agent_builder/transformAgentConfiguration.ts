import type {
  AgentBuilderAction,
  AgentBuilderFormData,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import type { SupportedAgentBuilderActionType } from "@app/components/agent_builder/types";
import {
  AGENT_BUILDER_MCP_SERVERS,
  MCP_SERVER_TO_ACTION_TYPE_MAP,
} from "@app/components/agent_builder/types";
import {
  createMinimalDataSourceView,
  createMinimalDataSourceViewContentNodes,
  validateDataSourceConfiguration,
} from "@app/components/agent_builder/utils";
import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import { isInternalMCPServerOfName } from "@app/lib/actions/mcp_internal_actions/constants";
import type { AgentActionConfigurationType } from "@app/lib/actions/types/agent";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration";
import type {
  DataSourceViewSelectionConfigurations,
  UserType,
} from "@app/types";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { DEFAULT_MAX_STEPS_USE_PER_RUN } from "@app/types/assistant/agent";
import { GPT_4O_MODEL_CONFIG } from "@app/types/assistant/assistant";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export function transformAgentConfigurationToFormData(
  agentConfiguration: AgentConfigurationType,
  currentUser: UserType,
  agentEditors: UserType[] = [],
  includeActions: boolean = true
): Result<AgentBuilderFormData, Error> {
  try {
    const actionsResult =
      includeActions && "actions" in agentConfiguration
        ? transformActionsToFormData(
            agentConfiguration.actions,
            agentConfiguration.visualizationEnabled
          )
        : new Ok([]);

    if (actionsResult.isErr()) {
      return new Err(actionsResult.error);
    }

    const formData: AgentBuilderFormData = {
      agentSettings: {
        name: agentConfiguration.name,
        description: agentConfiguration.description,
        pictureUrl: agentConfiguration.pictureUrl,
        scope:
          agentConfiguration.scope === "global"
            ? "visible"
            : agentConfiguration.scope,
        editors: agentEditors.length > 0 ? agentEditors : [currentUser],
        slackProvider: null, // TODO: determine from agent configuration
        slackChannels: [], // TODO: determine from agent configuration
        tags: agentConfiguration.tags,
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
      actions: actionsResult.value,
      maxStepsPerRun:
        agentConfiguration.maxStepsPerRun || DEFAULT_MAX_STEPS_USE_PER_RUN,
    };

    return new Ok(formData);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

export function transformActionsToFormData(
  actions: AgentActionConfigurationType[],
  visualizationEnabled: boolean = false
): Result<AgentBuilderAction[], Error> {
  try {
    const formActions: AgentBuilderAction[] = [];

    // Transform MCP server configurations to form actions
    for (const action of actions) {
      if (!isServerSideMCPServerConfiguration(action)) {
        continue;
      }

      // Check if this is an agent builder MCP server and transform it
      const matchingServerName = AGENT_BUILDER_MCP_SERVERS.find((serverName) =>
        isInternalMCPServerOfName(action.internalMCPServerId, serverName)
      );

      if (matchingServerName) {
        const actionType = MCP_SERVER_TO_ACTION_TYPE_MAP[matchingServerName];
        const transformResult = transformMCPServerConfigToAction(
          action,
          actionType
        );
        if (transformResult.isErr()) {
          return new Err(transformResult.error);
        }
        formActions.push(transformResult.value);
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

    return new Ok(formActions);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

function transformMCPServerConfigToAction(
  mcpConfig: ServerSideMCPServerConfigurationType,
  actionType: SupportedAgentBuilderActionType
): Result<AgentBuilderAction, Error> {
  try {
    const dataSourceConfigurationsResult = transformDataSourceConfigurations(
      mcpConfig.dataSources || []
    );

    if (dataSourceConfigurationsResult.isErr()) {
      return new Err(dataSourceConfigurationsResult.error);
    }

    const baseActionData = {
      id: mcpConfig.sId,
      name: mcpConfig.name,
      description: mcpConfig.description || "",
      noConfigurationRequired: false,
    };

    const dataSourceConfigurations = dataSourceConfigurationsResult.value;

    // Create properly typed action objects
    switch (actionType) {
      case "EXTRACT_DATA":
        return new Ok({
          ...baseActionData,
          type: "EXTRACT_DATA",
          configuration: {
            type: "EXTRACT_DATA",
            dataSourceConfigurations,
            timeFrame: mcpConfig.timeFrame,
            jsonSchema: mcpConfig.jsonSchema,
          },
        });
      case "INCLUDE_DATA":
        return new Ok({
          ...baseActionData,
          type: "INCLUDE_DATA",
          configuration: {
            type: "INCLUDE_DATA",
            dataSourceConfigurations,
            timeFrame: mcpConfig.timeFrame,
          },
        });
      default:
        return new Ok({
          ...baseActionData,
          type: "SEARCH",
          configuration: {
            type: "SEARCH",
            dataSourceConfigurations,
          },
        });
    }
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

/**
 * Transforms server-side data source configurations into client-side form data structure.
 *
 * **Problem this solves:**
 * MCP server configurations store data sources in a compact, server-optimized format
 * (DataSourceConfiguration[]), but the agent builder form needs a rich, UI-optimized
 * format (DataSourceViewSelectionConfigurations) for rendering and editing.
 *
 * **Key transformations:**
 * 1. **Structure**: Array → Record (keyed by dataSourceViewId for O(1) lookup)
 * 2. **Data completeness**: Minimal server data → Full UI objects with placeholders
 * 3. **Selection logic**: Parent filter presence → isSelectAll boolean flag
 * 4. **Resource mapping**: Parent IDs → DataSourceViewContentNode objects
 *
 * **Why minimal objects are safe:**
 * The form initially shows placeholder data (loading states), then the real
 * DataSourceView objects are loaded asynchronously via SWR hooks and merged
 * into the form state, replacing these minimal placeholders.
 */
function transformDataSourceConfigurations(
  dataSourceConfigs: DataSourceConfiguration[]
): Result<DataSourceViewSelectionConfigurations, Error> {
  try {
    const configurations: DataSourceViewSelectionConfigurations = {};

    for (const dsConfig of dataSourceConfigs) {
      const validationResult = validateDataSourceConfiguration(dsConfig);
      if (validationResult.isErr()) {
        return new Err(
          new Error(
            `Invalid data source configuration: ${validationResult.error.message}`
          )
        );
      }

      // Create minimal placeholder objects that will be hydrated by SWR
      const dataSourceView = createMinimalDataSourceView(
        dsConfig.dataSourceViewId
      );
      const selectedResources = dsConfig.filter?.parents?.in?.length
        ? createMinimalDataSourceViewContentNodes(dsConfig.filter.parents.in)
        : [];

      // Map to UI-friendly structure with key selection logic
      configurations[dsConfig.dataSourceViewId] = {
        dataSourceView,
        selectedResources,
        isSelectAll: !dsConfig.filter?.parents, // No parent filter = select all
        tagsFilter: dsConfig.filter?.tags || null,
      };
    }

    return new Ok(configurations);
  } catch (error) {
    return new Err(normalizeError(error));
  }
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
