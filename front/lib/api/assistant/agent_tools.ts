import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/mcp_actions";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { getRunnerForActionConfiguration } from "@app/lib/actions/runners";
import type {
  ActionConfigurationType,
  AgentActionSpecification,
} from "@app/lib/actions/types/agent";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import type {
  AgentActionsEvent,
  AgentErrorEvent,
  AgentToolCall,
} from "@app/types/assistant/agent";
import { removeNulls } from "@app/types/shared/utils/general";

export async function* processToolCallsInLoop({
  auth,
  toolCalls,
  availableActions,
  specifications,
  conversationId,
  agentConfigurationId,
  agentMessageId,
  dustRunId,
}: {
  auth: Authenticator;
  toolCalls: AgentToolCall[];
  availableActions: ActionConfigurationType[];
  specifications: AgentActionSpecification[];
  conversationId: string;
  agentConfigurationId: string;
  agentMessageId: string;
  dustRunId: string;
}): AsyncGenerator<AgentActionsEvent | AgentErrorEvent> {
  const owner = auth.getNonNullableWorkspace();
  const actions: AgentActionsEvent["actions"] = [];

  for (const a of toolCalls) {
    // Sometimes models will return a name with a triple underscore instead of a double underscore, we dynamically handle it.
    const actionNamesFromLLM: string[] = removeNulls([
      a.name,
      a.name?.replace("___", TOOL_NAME_SEPARATOR) ?? null,
    ]);
    let action = availableActions.find((ac) =>
      actionNamesFromLLM.includes(ac.name)
    );
    let args = a.arguments;
    let spec =
      specifications.find((s) => actionNamesFromLLM.includes(s.name)) ?? null;

    if (!action) {
      if (!a.name) {
        logger.error(
          {
            workspaceId: owner.sId,
            conversationId,
            configurationId: agentConfigurationId,
            messageId: agentMessageId,
            actionName: a.name,
            availableActions: availableActions.map((a) => a.name),
          },
          "Model attempted to run an action that is not part of the agent configuration (no name)."
        );
        yield {
          type: "agent_error",
          created: Date.now(),
          configurationId: agentConfigurationId,
          messageId: agentMessageId,
          error: {
            code: "action_not_found",
            message:
              `The agent attempted to run an invalid action (no name). ` +
              `This model error can be safely retried.`,
            metadata: null,
          },
        } satisfies AgentErrorEvent;
        return;
      } else {
        const mcpServerView =
          await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
            auth,
            "missing_action_catcher"
          );
        // Could happen if the internal server has not already been added
        if (!mcpServerView) {
          logger.error(
            {
              workspaceId: owner.sId,
              conversationId,
              configurationId: agentConfigurationId,
              messageId: agentMessageId,
              actionName: a.name,
              availableActions: availableActions.map((a) => a.name),
            },
            "Model attempted to run an action that is not part of the agent configuration (no server)."
          );
          yield {
            type: "agent_error",
            created: Date.now(),
            configurationId: agentConfigurationId,
            messageId: agentMessageId,
            error: {
              code: "action_not_found",
              message:
                `The agent attempted to run an invalid action (${a.name}). ` +
                `This model error can be safely retried (no server).`,
              metadata: null,
            },
          } satisfies AgentErrorEvent;
          return;
        }
        logger.warn(
          {
            workspaceId: owner.sId,
            conversationId,
            configurationId: agentConfigurationId,
            messageId: agentMessageId,
            actionName: a.name,
            availableActions: availableActions.map((a) => a.name),
          },
          "Model attempted to run an action that is not part of the agent configuration but we'll try to catch it."
        );
        const catchAllAction: MCPToolConfigurationType = {
          id: -1,
          sId: generateRandomModelSId(),
          type: "mcp_configuration" as const,
          name: a.name,
          originalName: a.name,
          description: null,
          dataSources: null,
          tables: null,
          childAgentId: null,
          reasoningModel: null,
          timeFrame: null,
          jsonSchema: null,
          additionalConfiguration: {},
          mcpServerViewId: mcpServerView.sId,
          dustAppConfiguration: null,
          internalMCPServerId: mcpServerView.internalMCPServerId,
          inputSchema: {},
          availability: "auto_hidden_builder",
          permission: "never_ask",
          toolServerId: mcpServerView.sId,
          mcpServerName: "missing_action_catcher" as InternalMCPServerNameType,
        };
        action = catchAllAction;
        args = {};
        spec = {
          description:
            "The agent attempted to run an invalid action, this will catch it.",
          inputSchema: {},
          name: a.name,
        };
      }
    }
    actions.push({
      action: action!,
      inputs: args ?? {},
      specification: spec,
      functionCallId: a.functionCallId ?? null,
    });
  }

  yield {
    type: "agent_actions",
    runId: dustRunId,
    created: Date.now(),
    actions,
  } satisfies AgentActionsEvent;
}

export const buildSpecifications = async ({
  auth,
  availableActions,
  conversationId,
  agentConfigurationId,
  agentMessageId,
}: {
  auth: Authenticator;
  availableActions: ActionConfigurationType[];
  conversationId: string;
  agentConfigurationId: string;
  agentMessageId: string;
}): Promise<AgentActionSpecification[] | null> => {
  const specifications: AgentActionSpecification[] = [];
  for (const a of availableActions) {
    const specRes = await getRunnerForActionConfiguration(a).buildSpecification(
      auth,
      {
        name: a.name,
        description: a.description ?? null,
      }
    );

    if (specRes.isErr()) {
      logger.error(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          conversationId,
          agentConfigurationId,
          agentMessageId,
          error: specRes.error,
        },
        "Failed to build the specification for action."
      );
      return null;
    }

    // Truncate the description to 1024 characters
    specRes.value.description = specRes.value.description.slice(0, 1024);
    specifications.push(specRes.value);
  }
  return specifications;
};
