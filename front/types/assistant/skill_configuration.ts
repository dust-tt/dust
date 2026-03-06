import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { AgentsUsageType } from "@app/types/data_source";
import type { UserType } from "@app/types/user";

export type SkillStatus = "active" | "archived" | "suggested";

export const SKILL_SOURCES = ["web_app", "github", "local_file"] as const;

export type SkillSourceType = (typeof SKILL_SOURCES)[number];

export type SkillSourceMetadata = {
  repoUrl: string;
  filePath: string;
};

export type SkillType = {
  id: number;
  sId: string;
  createdAt: number | null;
  updatedAt: number | null;
  editedBy: number | null;
  status: SkillStatus;
  name: string;
  agentFacingDescription: string;
  userFacingDescription: string;
  instructions: string | null;
  icon: string | null;
  source: SkillSourceType | null;
  sourceMetadata: SkillSourceMetadata | null;
  requestedSpaceIds: string[];
  tools: MCPServerViewType[];
  fileAttachments: {
    fileId: string;
    fileName: string;
  }[];
  canWrite: boolean;
  isExtendable: boolean;
  extendedSkillId: string | null;
  isDiscoverable: boolean;
};

export type SkillRelations = {
  usage: AgentsUsageType;
  editors: UserType[] | null;
  editedByUser: UserType | null;
  extendedSkill: SkillType | null;
};

export type SkillWithRelationsType = SkillType & {
  relations: SkillRelations;
};

export type SkillWithVersionType = SkillType & {
  version: number;
};
