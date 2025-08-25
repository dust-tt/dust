import { LightMCPToolConfigurationType } from "@app/lib/actions/mcp";
import { ToolExecutionStatus } from "@app/lib/actions/statuses";
import { StepContext } from "@app/lib/actions/types";
import { ModelId } from "@app/types/shared/model_id";

export type AgentMCPActionType = {
  agentMessageId: ModelId;
  augmentedInputs: Record<string, unknown>;
  citationsAllocated: number;
  mcpServerConfigurationId: string;
  status: ToolExecutionStatus;
  stepContentId: ModelId;
  stepContext: StepContext;
  toolConfiguration: LightMCPToolConfigurationType;
  version: number;
  workspaceId: ModelId;
};
