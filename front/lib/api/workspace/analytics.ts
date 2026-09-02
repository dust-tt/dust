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
};

export type GetWorkspaceTopAgentsResponse = {
  agents: WorkspaceTopAgentRow[];
};
