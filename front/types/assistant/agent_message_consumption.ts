import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";

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
  grossAttributedCredits: number;
  directCredits: number;
  pending: boolean;
};

export type AgentMessageConsumptionDetails = {
  attributionVersion: number;
  grossAttributedCredits: number;
  estimatedCacheSavingsCredits: number | null;
  agentWorkCredits: number;
  tools: AgentMessageConsumptionToolDetails[];
};

export type AgentMessageConsumptionResponse = {
  billedCredits: number | null;
  details: AgentMessageConsumptionDetails | null;
};
