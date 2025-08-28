import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import type { ModelId } from "@app/types/shared/model_id";

export type AgentMCPActionType = {
  agentMessageId: ModelId;
  // TODO(durable-agents): prevent exposing the function call name
  //  currently used in the extension to guess the tool name but quite brittle.
  functionCallName: string;
  id: ModelId;
  internalMCPServerName: InternalMCPServerNameType | null;
  mcpServerId: string | null;
  params: Record<string, unknown>;
  status: ToolExecutionStatus;
};
