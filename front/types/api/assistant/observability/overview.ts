export type AgentCostStats = {
  totalCostCredits: number | null;
  avgCostCredits: number | null;
  medianCostCredits: number | null;
};

export type GetAgentOverviewResponseBody = {
  activeUsers: number;
  mentions: {
    messageCount: number;
    conversationCount: number;
    timePeriodSec: number;
  };
  feedbacks: {
    positiveFeedbacks: number;
    negativeFeedbacks: number;
    timePeriodSec: number;
  };
  costs: AgentCostStats;
};
