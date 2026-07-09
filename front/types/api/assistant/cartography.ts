export type AgentCartographyCoordinates = Record<string, [number, number]>;

export type GetAgentCartographyCoordinatesResponseBody = {
  coordinates: AgentCartographyCoordinates;
};
