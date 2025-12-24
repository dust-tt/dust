import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { AgentsUsageType } from "@app/types/data_source";
import type { UserType } from "@app/types/user";

export type SkillStatus = "active" | "archived";

export type SkillType = {
  id: number;
  sId: string;
  createdAt: number | null;
  updatedAt: number | null;
  authorId: number | null;
  status: SkillStatus;
  name: string;
  agentFacingDescription: string;
  userFacingDescription: string;
  instructions: string | null;
  icon: string | null;
  requestedSpaceIds: string[];
  tools: MCPServerViewType[];
  canWrite: boolean;
  isExtendable: boolean;
  extendedSkillId: string | null;
};

export type SkillRelations = {
  usage: AgentsUsageType;
  editors: UserType[] | null;
  mcpServerViews: MCPServerViewType[];
  author: UserType | null;
  extendedSkill: SkillType | null;
};

export type SkillWithRelationsType = SkillType & {
  relations: SkillRelations;
};
