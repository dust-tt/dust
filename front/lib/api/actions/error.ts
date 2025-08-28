import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type {
  ActionBaseParams,
  MCPApproveExecutionEvent,
  ToolNotificationEvent,
} from "@app/lib/actions/mcp";
import { MCPActionType } from "@app/lib/actions/mcp";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import { AgentMCPActionOutputItem } from "@app/lib/models/assistant/actions/mcp";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { AgentMCPActionType } from "@app/types/actions";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { AgentMessageType } from "@app/types/assistant/conversation";

type BaseErrorParams = {
  action: AgentMCPActionResource;
  actionBaseParams: ActionBaseParams;
  agentConfiguration: AgentConfigurationType;
  agentMessage: AgentMessageType;
  errorMessage: string;
  status: ToolExecutionStatus;
};

// Yields tool_error (stops conversation) - for auth/validation failures.
type YieldAsErrorParams = BaseErrorParams & {
  yieldAsError: true;
  errorCode?: string;
  errorMetadata?: Record<string, string | number | boolean> | null;
};

// Yields tool_success (continues conversation) - for timeouts/denials/execution errors.
type YieldAsSuccessParams = BaseErrorParams & {
  yieldAsError: false;
  actionBaseParams: ActionBaseParams;
};

type HandleErrorParams = YieldAsErrorParams | YieldAsSuccessParams;

export type AgentActionRunningEvents =
  | MCPParamsEvent
  | MCPApproveExecutionEvent
  | ToolNotificationEvent;

export type MCPSuccessEvent = {
  type: "tool_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: MCPActionType;
};

export type MCPErrorEvent = {
  type: "tool_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
    metadata: Record<string, string | number | boolean> | null;
  };
};

export type MCPParamsEvent = {
  type: "tool_params";
  created: number;
  configurationId: string;
  messageId: string;
  // TODO: cleanup this type from the public API users.
  action: AgentMCPActionType & { type: "tool_action"; output: null };
};

/**
 * Handles MCP action errors with type-safe discriminated union based on error severity.
 */
export async function handleMCPActionError(
  params: HandleErrorParams
): Promise<MCPErrorEvent | MCPSuccessEvent> {
  const { agentConfiguration, agentMessage, errorMessage, status } = params;

  const outputContent: CallToolResult["content"][number] = {
    type: "text",
    text: errorMessage,
  };

  const { action, actionBaseParams } = params;

  await AgentMCPActionOutputItem.create({
    workspaceId: action.workspaceId,
    agentMCPActionId: action.id,
    content: outputContent,
  });

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
    action: new MCPActionType({
      ...actionBaseParams,
      generatedFiles: [],
      status,
      id: action.id,
      output: [outputContent],
      type: "tool_action",
    }),
  };
}
