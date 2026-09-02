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
  attributionVersion: number;
  /** Agent work after assigning the billing reconciliation exclusively to model input rows. */
  agentWorkCredits: number;
  tools: AgentMessageConsumptionToolDetails[];
};

export type AgentMessageConsumptionDetailsWithModels =
  AgentMessageConsumptionDetails & {
    models: AgentMessageConsumptionModelDetails[];
  };

export type AgentMessageConsumptionResponse = {
  billedCredits: number | null;
  /** Total credits billed by this message and its recursively spawned sub-agents. */
  totalBilledCredits?: number;
  details: AgentMessageConsumptionDetails | null;
};

export type AgentMessageConsumptionWithModelsResponse = Omit<
  AgentMessageConsumptionResponse,
  "details"
> & {
  details: AgentMessageConsumptionDetailsWithModels | null;
};
