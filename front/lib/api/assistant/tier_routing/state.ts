import type { RoutableStreamId } from "@app/lib/api/assistant/tier_routing/decide_tier";
import { ROUTABLE_STREAM_IDS } from "@app/lib/api/assistant/tier_routing/decide_tier";
import type { ConversationMetadata } from "@app/types/assistant/conversation";
import type { ModelStreamIdType } from "@app/types/assistant/models/auto";
import { MODEL_STREAM_IDS } from "@app/types/assistant/models/auto";
import { z } from "zod";

const AUTO_TIER_ROUTING_METADATA_KEY = "autoTierRouting";

const autoTierRoutingStateSchema = z.object({
  configuredStreamId: z.enum(ROUTABLE_STREAM_IDS),
  currentStreamId: z.enum(MODEL_STREAM_IDS),
  // "settled": routing landed on the configured tier, so the conversation stays on it.
  status: z.enum(["routing", "settled"]),
});
export type AutoTierRoutingState = z.infer<typeof autoTierRoutingStateSchema>;

// Keyed by agent configuration sId: each agent of a conversation is routed on its own.
const autoTierRoutingStatesSchema = z.record(
  z.string(),
  autoTierRoutingStateSchema
);

function parseStates(
  metadata: ConversationMetadata
): Record<string, AutoTierRoutingState> {
  const parsed = autoTierRoutingStatesSchema.safeParse(
    metadata[AUTO_TIER_ROUTING_METADATA_KEY]
  );

  return parsed.success ? parsed.data : {};
}

// A state recorded for another configured tier is stale: the agent's tier changed since.
export function getAutoTierRoutingState(
  metadata: ConversationMetadata,
  agentSId: string,
  configured: RoutableStreamId
): AutoTierRoutingState | null {
  const state = parseStates(metadata)[agentSId];

  return state?.configuredStreamId === configured ? state : null;
}

/**
 * @cc [owner:pmilliotte,label:product] settled-conversation-never-rerouted
 * A routing decision landing on the configured stream MUST settle the agent's routing for the
 * conversation; a settled state MUST make routing skip every later message of that agent until its
 * configured stream changes.
 */
export function nextAutoTierRoutingState(
  configured: RoutableStreamId,
  routed: ModelStreamIdType
): AutoTierRoutingState {
  return {
    configuredStreamId: configured,
    currentStreamId: routed,
    status: routed === configured ? "settled" : "routing",
  };
}

export function withAutoTierRoutingState(
  metadata: ConversationMetadata,
  agentSId: string,
  state: AutoTierRoutingState
): Partial<ConversationMetadata> {
  return {
    [AUTO_TIER_ROUTING_METADATA_KEY]: {
      ...parseStates(metadata),
      [agentSId]: state,
    },
  };
}
