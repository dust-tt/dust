import { MCPServerViewSchema } from "@app/lib/api/mcp_schemas";
import type { AgentsUsageType } from "@app/types/data_source";
import type { UserType } from "@app/types/user";
import { z } from "zod";

export const SKILL_STATUSES = ["active", "archived", "suggested"] as const;
export type SkillStatus = (typeof SKILL_STATUSES)[number];

export const SKILL_SOURCES = ["web_app", "github", "local_file"] as const;

export type SkillSourceType = (typeof SKILL_SOURCES)[number];

export const SkillSourceMetadataSchema = z.object({
  repoUrl: z.string().optional(),
  filePath: z.string(),
});

export type SkillSourceMetadata = z.infer<typeof SkillSourceMetadataSchema>;

export const SkillSchema = z.object({
  id: z.number(),
  sId: z.string(),
  createdAt: z.number().nullable(),
  updatedAt: z.number().nullable(),
  editedBy: z.number().nullable(),
  status: z.enum(SKILL_STATUSES),
  name: z.string(),
  agentFacingDescription: z.string(),
  userFacingDescription: z.string(),
  instructions: z.string().nullable(),
  icon: z.string().nullable(),
  source: z.enum(SKILL_SOURCES).nullable(),
  sourceMetadata: SkillSourceMetadataSchema.nullable(),
  requestedSpaceIds: z.array(z.string()),
  tools: z.array(MCPServerViewSchema),
  fileAttachments: z.array(
    z.object({
      fileId: z.string(),
      fileName: z.string(),
    })
  ),
  canWrite: z.boolean(),
  isExtendable: z.boolean(),
  isDefault: z.boolean(),
  extendedSkillId: z.string().nullable(),
});

export type SkillType = z.infer<typeof SkillSchema>;

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
