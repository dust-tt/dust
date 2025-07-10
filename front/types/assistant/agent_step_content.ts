import type { ModelId } from "@app/types";
import type { AgentContentItemType } from "@app/types/assistant/agent_message_content";

export type AgentStepContentType = {
  id: ModelId;
  sId: string;
  createdAt: number;
  updatedAt: number;
  agentMessageId: ModelId;
  step: number;
  index: number;
  version: number;
  type: AgentContentItemType["type"];
  value: AgentContentItemType;
  // Array of MCP action IDs that reference this step content.
  mcpActionIds?: ModelId[];
};
