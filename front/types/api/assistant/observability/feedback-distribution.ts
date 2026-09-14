export type AgentFeedbackDistributionPoint = {
  timestamp: number;
  positive: number;
  negative: number;
};

export type GetAgentFeedbackDistributionResponseBody = {
  points: AgentFeedbackDistributionPoint[];
};
