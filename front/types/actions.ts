import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/server_constants";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import type { ActionGeneratedFileType } from "@app/lib/actions/types";
import type { ModelId } from "@app/types/shared/model_id";

export type AgentMCPActionType = {
  id: ModelId;
  sId: string;
  createdAt: number;

  agentMessageId: ModelId;
  internalMCPServerName: InternalMCPServerNameType | null;
  mcpServerId: string | null;
  // TODO(MCPActionDetails): prevent exposing the function call name
  //  currently used in the extension to guess the tool name but quite brittle.
  functionCallName: string;
  functionCallId: string;

  params: Record<string, unknown>;
  citationsAllocated: number;
  status: ToolExecutionStatus;
  step: number;
};

export type AgentMCPActionWithOutputType = AgentMCPActionType & {
  generatedFiles: ActionGeneratedFileType[];
  output: CallToolResult["content"] | null;
};
