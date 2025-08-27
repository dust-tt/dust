import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { LightMCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import type { StepContext } from "@app/lib/actions/types";
import type { ModelId } from "@app/types/shared/model_id";

export type AgentMCPActionType = {
  agentMessageId: ModelId;
  citationsAllocated: number;
  functionCallId: string | null;
  functionCallName: string | null;
  id: ModelId;
  internalMCPServerName: InternalMCPServerNameType | null;
  mcpServerConfigurationId: string;
  output: CallToolResult["content"] | null;
  params: Record<string, unknown>;
  status: ToolExecutionStatus;
  stepContentId: ModelId;
  stepContext: StepContext;
  toolConfiguration: LightMCPToolConfigurationType;
  version: number;
  workspaceId: ModelId;
};
