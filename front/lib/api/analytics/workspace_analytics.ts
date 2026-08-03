import type { SkillUsagePoint } from "@app/lib/api/assistant/observability/skill_usage";

export type GetWorkspaceSkillUsageResponse = {
  points: SkillUsagePoint[];
};

export type WorkspaceTopUserRow = {
  userId: string;
  name: string;
  imageUrl: string | null;
  messageCount: number;
  agentCount: number;
};

export type GetWorkspaceTopUsersResponse = {
  users: WorkspaceTopUserRow[];
};
