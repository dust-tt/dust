import { MCPServerViewSchema } from "@app/lib/api/mcp_schemas";
import type { AgentsUsageType } from "@app/types/data_source";
import type { UserType } from "@app/types/user";
import { z } from "zod";

export const SKILL_STATUSES = ["active", "archived", "suggested"] as const;
export type SkillStatus = (typeof SKILL_STATUSES)[number];

export const SKILL_REINFORCEMENT_MODES = ["auto", "on", "off"] as const;
export type SkillReinforcementMode = (typeof SKILL_REINFORCEMENT_MODES)[number];

export const SKILL_VIEWS = ["full", "summary"] as const;
export type SkillViewType = (typeof SKILL_VIEWS)[number];

export const SKILL_SOURCES = [
  "web_app",
  "github",
  "api",
  "local_file",
] as const;

export type SkillSourceType = (typeof SKILL_SOURCES)[number];

export const SkillSourceMetadataSchema = z.object({
  repoUrl: z.string().optional(),
  filePath: z.string(),
});

export type SkillSourceMetadata = z.infer<typeof SkillSourceMetadataSchema>;

export const SkillSummarySchema = z.object({
  id: z.number(),
  sId: z.string(),
  createdAt: z.number().nullable(),
  updatedAt: z.number().nullable(),
  editedBy: z.number().nullable(),
  status: z.enum(SKILL_STATUSES),
  name: z.string(),
  agentFacingDescription: z.string(),
  userFacingDescription: z.string(),
  icon: z.string().nullable(),
  source: z.enum(SKILL_SOURCES).nullable(),
  sourceMetadata: SkillSourceMetadataSchema.nullable(),
  reinforcement: z.enum(SKILL_REINFORCEMENT_MODES).optional(),
  lastReinforcementAnalysisAt: z.string().nullable().optional(),
  requestedSpaceIds: z.array(z.string()),
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

export type SkillSummaryType = z.infer<typeof SkillSummarySchema>;

export const SkillSchema = SkillSummarySchema.extend({
  instructions: z.string().nullable(),
  instructionsHtml: z.string().nullable(),
  tools: z.array(MCPServerViewSchema),
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
