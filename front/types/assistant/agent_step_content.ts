import type { ModelId } from "@app/types";
import type { AgentContentItemType } from "@app/types/assistant/agent_message_content";

// Simple type to avoid circular dependency with AgentMCPActionResource
export type SimpleMCPAction = {
  id: ModelId;
  mcpServerConfigurationId: string;
  functionCallId: string | null;
  functionCallName: string | null;
  params: Record<string, unknown>;
  executionState:
    | "pending"
    | "timeout"
    | "allowed_explicitly"
    | "allowed_implicitly"
    | "denied";
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
