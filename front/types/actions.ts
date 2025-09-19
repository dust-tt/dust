import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import type { ActionGeneratedFileType } from "@app/lib/actions/types";
import type { ModelId } from "@app/types/shared/model_id";

export type AgentMCPActionType = {
  agentMessageId: ModelId;
  citationsAllocated: number;
  // TODO(MCPActionDetails): prevent exposing the function call name
  //  currently used in the extension to guess the tool name but quite brittle.
  functionCallName: string;
  functionCallId: string;
  id: ModelId;
  internalMCPServerName: InternalMCPServerNameType | null;
  mcpServerId: string | null;
  params: Record<string, unknown>;
  status: ToolExecutionStatus;
  step: number;
};

export type AgentMCPActionWithOutputType = AgentMCPActionType & {
  generatedFiles: ActionGeneratedFileType[];
  output: CallToolResult["content"] | null;
};

// TODO(2025-09-16 aubin): remove this typeguard, either replace with a zod schema or fix the
//  public type to remove the reliance on this typeguard.
function isAgentMCPActionType(action: unknown): action is AgentMCPActionType {
  return (
    typeof action === "object" &&
    action !== null &&
    "agentMessageId" in action &&
    typeof action.agentMessageId === "number" &&
    "citationsAllocated" in action &&
    typeof action.citationsAllocated === "number" &&
    "functionCallName" in action &&
    typeof action.functionCallName === "string" &&
    "functionCallId" in action &&
    typeof action.functionCallId === "string" &&
    "id" in action &&
    typeof action.id === "number" &&
    "internalMCPServerName" in action &&
    (action.internalMCPServerName === null ||
      typeof action.internalMCPServerName === "string") &&
    "mcpServerId" in action &&
    (action.mcpServerId === null || typeof action.mcpServerId === "string") &&
    "params" in action &&
    typeof action.params === "object" &&
    action.params !== null &&
    "status" in action &&
    typeof action.status === "string" &&
    "step" in action &&
    typeof action.step === "number"
  );
}

// TODO(2025-09-16 aubin): remove this typeguard, either replace with a zod schema or fix the
//  public type to remove the reliance on this typeguard.
export function isAgentMCPActionWithOutputType(
  action: unknown
): action is AgentMCPActionWithOutputType {
  return (
    isAgentMCPActionType(action) &&
    "generatedFiles" in action &&
    Array.isArray(action.generatedFiles) &&
    "output" in action &&
    (action.output === null || Array.isArray(action.output))
  );
}
