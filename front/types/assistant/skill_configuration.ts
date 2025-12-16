import type { AgentsUsageType } from "@app/types/data_source";
import type { UserType } from "@app/types/user";

export type SkillStatus = "active" | "archived";

export type SkillType = {
  id: number;
  sId: string;
  createdAt: number | null;
  updatedAt: number | null;
  versionAuthorId: number | null;
  status: SkillStatus;
  name: string;
  agentFacingDescription: string;
  userFacingDescription: string;
  instructions: string | null;
  icon: string | null;
  requestedSpaceIds: string[];
  tools: { mcpServerViewId: string }[];
  canWrite: boolean;
};

export type SkillRelations = {
  usage: AgentsUsageType;
  editors: UserType[] | null;
};
