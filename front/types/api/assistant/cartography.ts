export type AgentCartographyCoordinates = Record<string, [number, number]>;

/**
 * Confidence bucket for a probable-duplicate pair, derived from the embedding
 * cosine similarity. We expose a coarse enum rather than the raw score so the
 * frontend doesn't depend on the exact similarity scale (which may be retuned):
 *   - "medium":    similarity > 0.65
 *   - "high":      similarity > 0.8
 *   - "very_high": similarity > 0.9
 */
export type DuplicateConfidence = "medium" | "high" | "very_high";

/**
 * A pair of agents whose embeddings are similar enough to be flagged as
 * probable duplicates. `agentIds` holds the two agent sIds; `confidence` is the
 * bucketed confidence derived from their cosine similarity.
 */
export type AgentDuplicatePair = {
  agentIds: [string, string];
  confidence: DuplicateConfidence;
};

export type GetAgentCartographyResponseBody = {
  coordinates: AgentCartographyCoordinates;
  duplicates: AgentDuplicatePair[];
};
