import type { LightMCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import type { ActionGeneratedFileType } from "@app/lib/actions/types";
import type { CitationType } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type AgentMCPActionType = {
  id: ModelId;
  sId: string;
  createdAt: number;
  updatedAt: number;

  agentMessageId: ModelId;
  internalMCPServerName: InternalMCPServerNameType | null;
  toolName: string;
  mcpServerId: string | null;
  functionCallName: string;
  functionCallId: string;

  params: Record<string, unknown>;
  citationsAllocated: number;
  status: ToolExecutionStatus;
  step: number;
  executionDurationMs: number | null;
  displayLabels: {
    running: string;
    done: string;
  } | null;
};

export type AgentMCPActionWithOutputType = AgentMCPActionType & {
  generatedFiles: ActionGeneratedFileType[];
  output: CallToolResult["content"] | null;
  citations?: Record<string, CitationType> | null;
};

export type SandboxMCPActionType = {
  sId: string;
  workspaceId: ModelId;
  agentMessageId: ModelId;
  agentMCPActionId: ModelId;
  status: ToolExecutionStatus;
  toolConfiguration: LightMCPToolConfigurationType;
  augmentedInputs: Record<string, unknown>;
  functionCallName: string;
  internalMCPServerName: InternalMCPServerNameType | null;
};
