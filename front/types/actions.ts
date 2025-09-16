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
  functionCallName: string | null;
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
