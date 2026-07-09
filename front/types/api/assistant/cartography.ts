export type AgentCartographyCoordinates = Record<string, [number, number]>;

/**
 * A pair of agents whose embeddings are similar enough (cosine similarity above
 * the duplicate-detection threshold) to be flagged as probable duplicates.
 * `agentIds` holds the two agent sIds; `similarity` is their cosine similarity.
 */
export type AgentDuplicatePair = {
  agentIds: [string, string];
  similarity: number;
};

export type GetAgentCartographyCoordinatesResponseBody = {
  coordinates: AgentCartographyCoordinates;
  duplicates: AgentDuplicatePair[];
};
