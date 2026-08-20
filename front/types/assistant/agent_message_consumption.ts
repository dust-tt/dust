import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type {
  ModelIdType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";

export const AGENT_MESSAGE_CONSUMPTION_ITEM_TYPES = [
  "system",
  "input",
  "output",
  "reasoning",
  "tool",
] as const;

export type AgentMessageConsumptionItemType =
  (typeof AGENT_MESSAGE_CONSUMPTION_ITEM_TYPES)[number];

export type AgentMessageConsumptionToolDetails = {
  label: string;
  internalMCPServerName: InternalMCPServerNameType | null;
  toolName: string;
  callCount: number;
  /** Share of the total bill. Run-agent tools include their direct sub-agent's bill. */
  attributedCredits: number;
  directCredits: number;
  pending: boolean;
};

export type AgentMessageConsumptionModelDetails = {
  providerId: ModelProviderIdType;
  modelId: ModelIdType;
  displayName: string;
  attributedCredits: number;
};

export type AgentMessageConsumptionDetails = {
  attributionVersion: number;
  /** Non-tool work for the originating message after input-only billing reconciliation. */
  agentWorkCredits: number;
  tools: AgentMessageConsumptionToolDetails[];
};

export type AgentMessageConsumptionResponse = {
  billedCredits: number | null;
  /** Credits billed by direct sub-agents spawned from this message. */
  subAgentBilledCredits?: number;
  /** Total credits billed by this message and its direct sub-agents. */
  totalBilledCredits?: number;
  details: AgentMessageConsumptionDetails | null;
};
