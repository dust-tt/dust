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
  /** Share of the authoritative bill after reconciling exclusively through model input rows. */
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
  /** Oldest attribution version contributing to this message and sub-agent aggregate. */
  attributionVersion: number;
  /** Agent work across this message and its sub-agents after input-only reconciliation. */
  agentWorkCredits: number;
  tools: AgentMessageConsumptionToolDetails[];
};

export type AgentMessageConsumptionResponse = {
  billedCredits: number | null;
  /** Credits billed by sub-agents spawned from this message. */
  subAgentBilledCredits?: number;
  /** Total credits billed by this message and its recursively spawned sub-agents. */
  totalBilledCredits?: number;
  details: AgentMessageConsumptionDetails | null;
};
