import type {
  AgentBuilderAction,
  AgentBuilderFormData,
  BaseActionData,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import type { SupportedAgentBuilderActionType } from "@app/components/agent_builder/types";
import type { AssistantBuilderMCPConfiguration } from "@app/components/assistant_builder/types";
import type { UserType } from "@app/types";
import type { LightAgentConfigurationType, Result } from "@app/types";
import { Err, Ok } from "@app/types";
import { CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG } from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

/**
 * Transforms a light agent configuration (server-side) into agent builder form data (client-side).
 */
export function transformAgentConfigurationToFormData(
  agentConfiguration: LightAgentConfigurationType
): AgentBuilderFormData {
  return {
    agentSettings: {
      name: agentConfiguration.name,
      description: agentConfiguration.description,
      pictureUrl: agentConfiguration.pictureUrl,
      scope:
        agentConfiguration.scope === "global"
          ? "visible"
          : agentConfiguration.scope,
      editors: [], // Fallback - editors will be updated reactively
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
    actions: [], // Actions are always loaded client-side via SWR
  };
}

const SERVER_NAME_TO_ACTION_TYPE = {
  extract_data: "EXTRACT_DATA",
  include_data: "INCLUDE_DATA",
  search: "SEARCH",
} as const satisfies Record<string, SupportedAgentBuilderActionType>;

function isKnownServerName(
  serverName: string
): serverName is keyof typeof SERVER_NAME_TO_ACTION_TYPE {
  return serverName in SERVER_NAME_TO_ACTION_TYPE;
}

/**
 * Transforms assistant builder MCP configurations (from the builder actions API)
 * into agent builder form actions. This handles the fully hydrated data source
 * configurations that come from the server.
 */
export function transformAssistantBuilderActionsToFormData(
  assistantBuilderActions: AssistantBuilderMCPConfiguration[],
  mcpServerViews: Array<{ sId: string; server: { name: string } }> = []
): Result<AgentBuilderAction[], Error> {
  try {
    const formActions: AgentBuilderAction[] = [];

    for (const action of assistantBuilderActions) {
      if (action.type !== "MCP") {
        continue;
      }

      const mcpServerViewId = action.configuration.mcpServerViewId;
      const mcpServerView = mcpServerViews.find(
        (view) => view.sId === mcpServerViewId
      );

      const actionType = determineActionType(mcpServerView);

      const dataSourceConfigurations =
        action.configuration.dataSourceConfigurations ?? {};

      const baseActionData = {
        id: mcpServerViewId,
        name: action.name,
        description: action.description,
        noConfigurationRequired: action.noConfigurationRequired ?? false,
      };

      const formAction = createTypedAction(actionType, baseActionData, {
        dataSourceConfigurations,
        timeFrame: action.configuration.timeFrame,
        jsonSchema: action.configuration.jsonSchema,
      });

      formActions.push(formAction);
    }

    return new Ok(formActions);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

function determineActionType(
  mcpServerView: { server: { name: string } } | undefined
): SupportedAgentBuilderActionType {
  if (!mcpServerView) {
    throw new Error("MCP server view is required");
  }

  const serverName = mcpServerView.server.name;
  if (isKnownServerName(serverName)) {
    return SERVER_NAME_TO_ACTION_TYPE[serverName];
  }

  throw new Error(`Unknown MCP server name: ${serverName}`);
}

type ActionConfig = Pick<
  AssistantBuilderMCPConfiguration["configuration"],
  "dataSourceConfigurations" | "timeFrame" | "jsonSchema"
>;

function createTypedAction(
  actionType: SupportedAgentBuilderActionType,
  baseActionData: BaseActionData,
  config: ActionConfig
): AgentBuilderAction {
  const baseAction = {
    ...baseActionData,
    configuration: {
      dataSourceConfigurations: config.dataSourceConfigurations ?? {},
    },
  };

  switch (actionType) {
    case "EXTRACT_DATA":
      return {
        ...baseAction,
        type: "EXTRACT_DATA",
        configuration: {
          type: "EXTRACT_DATA",
          dataSourceConfigurations:
            baseAction.configuration.dataSourceConfigurations,
          timeFrame: config.timeFrame,
          jsonSchema: config.jsonSchema,
        },
      };

    case "INCLUDE_DATA":
      return {
        ...baseAction,
        type: "INCLUDE_DATA",
        configuration: {
          type: "INCLUDE_DATA",
          dataSourceConfigurations:
            baseAction.configuration.dataSourceConfigurations,
          timeFrame: config.timeFrame,
        },
      };

    case "SEARCH":
      return {
        ...baseAction,
        type: "SEARCH",
        configuration: {
          type: "SEARCH",
          dataSourceConfigurations:
            baseAction.configuration.dataSourceConfigurations,
        },
      };

    case "QUERY_TABLES":
      return {
        ...baseAction,
        type: "QUERY_TABLES",
        configuration: {
          type: "QUERY_TABLES",
          dataSourceConfigurations:
            baseAction.configuration.dataSourceConfigurations,
          timeFrame: config.timeFrame,
        },
      };
  }
}

export function getDefaultAgentFormData(user: UserType): AgentBuilderFormData {
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
        modelId: CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG.modelId,
        providerId: CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG.providerId,
      },
      temperature: 0.7,
      reasoningEffort:
        CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG.defaultReasoningEffort,
      responseFormat: undefined,
    },
    actions: [],
  };
}
