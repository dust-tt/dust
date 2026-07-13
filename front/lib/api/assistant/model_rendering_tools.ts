import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import { buildToolSpecification } from "@app/lib/actions/mcp";
import { autoInternalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import {
  isServerSideMCPServerConfiguration,
  isServerSideMCPToolConfiguration,
} from "@app/lib/actions/types/guards";
import { ANTHROPIC_PROVIDER_ID } from "@app/lib/api/llm/clients/anthropic/types";
import {
  parseAnthropicToolSearchBlock,
  TOOL_SEARCH_SERVER_TOOL_NAMES,
} from "@app/lib/api/llm/clients/anthropic/utils/tool_search_passthrough";
import { TOOL_SEARCH_TOOL } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/tool_search";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type { ConversationType } from "@app/types/assistant/conversation";
import { isAgentMessageType } from "@app/types/assistant/conversation";
import type { ModelConversationTypeMultiActions } from "@app/types/assistant/generation";
import { assertNever } from "@app/types/shared/utils/assert_never";

export function buildToolDefinitionsForTokenCount(
  specifications: AgentActionSpecification[],
  toolSearchEnabled: boolean
): string {
  const specsInContext = toolSearchEnabled
    ? specifications.filter((specification) => specification.eager)
    : specifications;

  return JSON.stringify([
    ...(toolSearchEnabled ? [TOOL_SEARCH_TOOL] : []),
    ...specsInContext.map((specification) => ({
      name: specification.name,
      description: specification.description,
      inputSchema: specification.inputSchema,
    })),
  ]);
}

export function buildBaseSpecifications(
  availableActions: MCPToolConfigurationType[],
  agentConfiguration: Pick<AgentConfigurationType, "sId" | "actions">
): AgentActionSpecification[] {
  const isCustomAgent = !isGlobalAgentId(agentConfiguration.sId);
  const agentActionModelIds = new Set(
    agentConfiguration.actions
      .filter(isServerSideMCPServerConfiguration)
      .map((action) => action.id)
      .filter((id) => id !== -1)
  );

  return availableActions
    .map((action) => {
      const specification = buildToolSpecification(action);
      if (
        isCustomAgent &&
        isServerSideMCPToolConfiguration(action) &&
        agentActionModelIds.has(action.id)
      ) {
        return { ...specification, eager: true };
      }

      return specification;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function getReplayedToolNames(
  modelConversation: ModelConversationTypeMultiActions,
  missingActionCatcherFunctionCallIds: Set<string>
): string[] {
  const toolNames = new Set<string>();

  for (const message of modelConversation.messages) {
    switch (message.role) {
      case "assistant":
        for (const content of message.contents) {
          if (
            content.type === "function_call" &&
            !missingActionCatcherFunctionCallIds.has(content.value.id)
          ) {
            toolNames.add(content.value.name);
          }
          if (
            content.type === "provider_passthrough" &&
            content.value.provider === ANTHROPIC_PROVIDER_ID
          ) {
            const block = parseAnthropicToolSearchBlock(content.value.block);

            if (
              block?.type === "tool_search_tool_result" &&
              block.content.type === "tool_search_tool_search_result"
            ) {
              for (const ref of block.content.tool_references) {
                if (
                  TOOL_SEARCH_SERVER_TOOL_NAMES.some(
                    (name) => name === ref.tool_name
                  )
                ) {
                  continue;
                }
                toolNames.add(ref.tool_name);
              }
            }
          }
        }
        break;
      case "function":
      case "compaction":
      case "user":
        break;
      default:
        assertNever(message);
    }
  }

  return [...toolNames];
}

export function getMissingActionCatcherFunctionCallIds(
  conversation: ConversationType
): Set<string> {
  const functionCallIds = new Set<string>();
  const missingActionCatcherMCPServerId = autoInternalMCPServerNameToSId({
    name: "missing_action_catcher",
    workspaceId: conversation.owner.id,
  });

  for (const messageVersions of conversation.content) {
    for (const message of messageVersions) {
      if (!isAgentMessageType(message)) {
        continue;
      }

      for (const action of message.actions) {
        if (action.mcpServerId === missingActionCatcherMCPServerId) {
          functionCallIds.add(action.functionCallId);
        }
      }
    }
  }

  return functionCallIds;
}

function buildReplayOnlyToolSpecification(
  name: string
): AgentActionSpecification {
  return {
    name,
    description:
      "Replay-only placeholder for a historical tool call. " +
      "This tool is not available for new calls.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: true,
    },
  };
}

export function buildSpecificationsWithReplayPlaceholders(
  baseSpecifications: AgentActionSpecification[],
  {
    modelConversation,
    missingActionCatcherFunctionCallIds = new Set(),
  }: {
    modelConversation: ModelConversationTypeMultiActions;
    missingActionCatcherFunctionCallIds?: Set<string>;
  }
): {
  specifications: AgentActionSpecification[];
  missingReplayedToolNames: string[];
} {
  const currentToolNames = new Set(baseSpecifications.map((spec) => spec.name));
  const missingReplayedToolNames = getReplayedToolNames(
    modelConversation,
    missingActionCatcherFunctionCallIds
  )
    .filter((name) => !currentToolNames.has(name))
    .sort();

  return {
    specifications: [
      ...baseSpecifications,
      ...missingReplayedToolNames.map((name) =>
        buildReplayOnlyToolSpecification(name)
      ),
    ].sort((left, right) => left.name.localeCompare(right.name)),
    missingReplayedToolNames,
  };
}
