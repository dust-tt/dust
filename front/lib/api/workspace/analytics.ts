export type GetWorkspaceAnalyticsOverviewResponse = {
  totalMembers: number;
  activeUsers: number;
};

export type WorkspaceTopAgentRow = {
  agentId: string;
  name: string;
  pictureUrl: string | null;
  messageCount: number;
  userCount: number;
  totalCostCredits: number | null;
};

export type GetWorkspaceTopAgentsResponse = {
  agents: WorkspaceTopAgentRow[];
};
