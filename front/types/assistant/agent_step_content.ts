import type { ModelId } from "@app/types";
import type { AgentContentItemType } from "@app/types/assistant/agent_message_content";

export type SimpleMCPAction = {
  sId: string;
  createdAt: string;
  functionCallName: string | null;
  params: Record<string, unknown>;
  executionState: string;
  isError: boolean;
  stepContentSId?: string;
};

export type AgentStepContentType = {
  id: ModelId;
  sId: string;
  createdAt: number;
  updatedAt: number;
  agentMessageId: ModelId;
  agentMessageSId?: string;
  step: number;
  index: number;
  version: number;
  type: AgentContentItemType["type"];
  value: AgentContentItemType;
  // Array of MCP actions that reference this step content.
  mcpActions?: SimpleMCPAction[];
};
