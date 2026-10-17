import type { DecisionScoreAnswer } from "@app/lib/model_constructors/types/output/decisions";
import type { ModelStreamIdType } from "@app/types/assistant/models/auto";
import {
  AUTO_COMPLEX_MODEL_ID,
  AUTO_FAST_MODEL_ID,
  AUTO_MODEL_ID,
} from "@app/types/assistant/models/auto";

// Lowest to highest.
const STREAM_TIER_LADDER = [
  AUTO_FAST_MODEL_ID,
  AUTO_MODEL_ID,
  AUTO_COMPLEX_MODEL_ID,
] as const satisfies readonly ModelStreamIdType[];

export const ROUTABLE_STREAM_IDS = [
  AUTO_MODEL_ID,
  AUTO_COMPLEX_MODEL_ID,
] as const satisfies readonly ModelStreamIdType[];
export type RoutableStreamId = (typeof ROUTABLE_STREAM_IDS)[number];

export function isRoutableStreamId(
  modelId: string
): modelId is RoutableStreamId {
  return ROUTABLE_STREAM_IDS.includes(modelId as RoutableStreamId);
}

export const TIER_ROUTING_CONFIDENCE_THRESHOLD = 0.8;

// The streams a message may be routed to, lowest first: every tier up to the configured one.
export function getRoutingCandidates(
  configured: RoutableStreamId
): ModelStreamIdType[] {
  return STREAM_TIER_LADDER.slice(
    0,
    STREAM_TIER_LADDER.indexOf(configured) + 1
  );
}

/**
 * @cc [owner:pmilliotte,label:product] routed-tier-never-above-configured
 * The chosen stream MUST be the lowest routing candidate whose cumulative probability (its own
 * level plus every lower level) reaches `TIER_ROUTING_CONFIDENCE_THRESHOLD`, and the configured
 * stream when none does. It MUST never be above the configured stream.
 */
export function chooseRoutedStream(
  answer: DecisionScoreAnswer,
  configured: RoutableStreamId
): ModelStreamIdType {
  let cumulativeProbability = 0;
  for (const [level, streamId] of getRoutingCandidates(configured).entries()) {
    cumulativeProbability +=
      answer.probabilities.find(({ value }) => value === level)?.probability ??
      0;
    if (cumulativeProbability >= TIER_ROUTING_CONFIDENCE_THRESHOLD) {
      return streamId;
    }
  }

  return configured;
}
