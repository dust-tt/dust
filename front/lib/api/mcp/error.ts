import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { MCPErrorEvent, MCPSuccessEvent } from "@app/lib/actions/mcp";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import { AgentMCPActionOutputItem } from "@app/lib/models/assistant/actions/mcp";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { AgentMessageType } from "@app/types/assistant/conversation";

type HandleErrorParams = {
  action: AgentMCPActionResource;
  agentConfiguration: AgentConfigurationType;
  agentMessage: AgentMessageType;
  errorContent: CallToolResult["content"];
  status: ToolExecutionStatus;
};

/**
 * Handles MCP action errors with type-safe discriminated union based on error severity.
 */
export async function handleMCPActionError(
  params: HandleErrorParams
): Promise<MCPErrorEvent | MCPSuccessEvent> {
  const { action, agentConfiguration, agentMessage, errorContent, status } =
    params;

  await AgentMCPActionOutputItem.bulkCreate(
    errorContent.map((item) => ({
      workspaceId: action.workspaceId,
      agentMCPActionId: action.id,
      content: item,
    }))
  );

  // If the tool is not already in a final state, we set it to errored (could be denied).
  if (!isToolExecutionStatusFinal(status)) {
    await action.updateStatus("errored");
  }

  // Yields tool_success to continue the conversation.
  return {
    type: "tool_success",
    created: Date.now(),
    configurationId: agentConfiguration.sId,
    messageId: agentMessage.sId,
    action: {
      ...action.toJSON(),
      output: errorContent,
      generatedFiles: [],
    },
  };
}
