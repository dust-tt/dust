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

export type AgentMessageConsumptionTool = {
  actionId: string;
  displayName: string;
  functionCallName: string;
  internalMCPServerName: InternalMCPServerNameType | null;
  toolName: string | null;
};

export type AgentMessageConsumptionItem = {
  itemType: AgentMessageConsumptionItemType;
  /**
   * Token footprint on the model input boundary. On a tool item, this is the
   * estimated footprint of the result produced by the tool execution.
   */
  inputTokensCount: number | null;
  /**
   * Token footprint on the model output boundary. On a tool item, this is the
   * estimated footprint of emitting the tool name and its parameters.
   */
  outputTokensCount: number | null;
  /** Estimated cache-naive attribution converted to microcredits, including direct tool credits. */
  grossAttributedCreditAmountMicro: number;
  /** Exact direct execution charge when the tool had one. */
  directCreditAmountMicro: number | null;
  tool: AgentMessageConsumptionTool | null;
};

export type AgentMessageConsumptionAttribution = {
  attributionVersion: number;
  grossAttributedCreditAmountMicro: number;
  items: AgentMessageConsumptionItem[];
};
