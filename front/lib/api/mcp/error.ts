import type { MCPErrorEvent, MCPSuccessEvent } from "@app/lib/actions/mcp";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

type HandleErrorParams = {
  action: AgentMCPActionResource | SandboxFunctionMCPActionResource;
  errorContent: CallToolResult["content"];
  status: ToolExecutionStatus;
  executionDurationMs: number;
};

/**
 * Handles MCP action errors with type-safe discriminated union based on error severity.
 */
export async function handleMCPActionError(
  auth: Authenticator,
  { action, errorContent, status, executionDurationMs }: HandleErrorParams
): Promise<MCPErrorEvent | MCPSuccessEvent> {
  const outputRes = await action.createOutputItems(
    auth,
    errorContent.map((item) => ({ content: item }))
  );
  if (outputRes.isErr()) {
    throw outputRes.error;
  }

  // If the tool is not already in a final state, we set it to errored (could be denied).
  if (!isToolExecutionStatusFinal(status)) {
    await action.markAsErrored({ executionDurationMs });
  }

  // Yields tool_success to continue the conversation.
  return {
    type: "tool_success",
    created: Date.now(),
    output: errorContent,
    generatedFiles: [],
  };
}
