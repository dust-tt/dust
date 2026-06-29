import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { AutoInternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";

/**
 * Get the ask_user_question MCP server for interactive clarifying questions.
 */
export function getAskUserQuestionServer(
  agentConfiguration: LightAgentConfigurationType,
  conversation: ConversationWithoutContentType,
  autoInternalViews: Map<AutoInternalMCPServerNameType, MCPServerViewResource>
): ServerSideMCPServerConfigurationType | null {
  const askUserQuestionView =
    autoInternalViews.get("ask_user_question") ?? null;

  if (!askUserQuestionView) {
    logger.warn(
      {
        agentConfigurationId: agentConfiguration.sId,
        conversationId: conversation.sId,
      },
      "MCP server view not found for ask_user_question. Ensure auto tools are created."
    );
    return null;
  }

  return {
    id: -1,
    sId: generateRandomModelSId(),
    type: "mcp_server_configuration",
    name: askUserQuestionView.name ?? "ask_user_question",
    description:
      askUserQuestionView.description ??
      "Ask the user a question with multiple-choice options.",
    dataSources: null,
    tables: null,
    childAgentId: null,
    timeFrame: null,
    jsonSchema: null,
    secretName: null,
    dustProject: null,
    additionalConfiguration: {},
    mcpServerViewId: askUserQuestionView.sId,
    dustAppConfiguration: null,
    internalMCPServerId: askUserQuestionView.mcpServerId,
  };
}
