import type { LightMCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import type { StepContext } from "@app/lib/actions/types";
import type { ModelId } from "@app/types/shared/model_id";

export type AgentMCPActionType = {
  id: ModelId;
  agentMessageId: ModelId;
  augmentedInputs: Record<string, unknown>;
  citationsAllocated: number;
  mcpServerConfigurationId: string;
  internalMCPServerName: InternalMCPServerNameType | null;
  status: ToolExecutionStatus;
  stepContentId: ModelId;
  stepContext: StepContext;
  toolConfiguration: LightMCPToolConfigurationType;
  version: number;
  workspaceId: ModelId;
};
