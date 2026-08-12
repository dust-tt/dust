import { MCPServerViewSchema } from "@app/lib/api/mcp_schemas";
import type { AgentsUsageType } from "@app/types/data_source";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { UserType } from "@app/types/user";
import { z } from "zod";

export const SKILL_STATUSES = ["active", "archived", "suggested"] as const;
export type SkillStatus = (typeof SKILL_STATUSES)[number];

export const SKILL_REINFORCEMENT_MODES = ["auto", "on", "off"] as const;
export type SkillReinforcementMode = (typeof SKILL_REINFORCEMENT_MODES)[number];

export const SKILL_AVAILABILITIES = [
  "editors",
  "workspace_users",
  "users_and_agents",
] as const;
export type SkillAvailability = (typeof SKILL_AVAILABILITIES)[number];

export const DEFAULT_SKILL_AVAILABILITY = "editors" satisfies SkillAvailability;

// The DB column is availability; isDefault survives as a boolean alias in the API and
// frontend. Remove these mappings once clients rely on availability directly.
export function availabilityFromIsDefault(
  isDefault: boolean
): SkillAvailability {
  return isDefault ? "users_and_agents" : "workspace_users";
}

export function isDefaultFromAvailability(
  availability: SkillAvailability
): boolean {
  switch (availability) {
    case "users_and_agents":
      return true;
    case "workspace_users":
    case "editors":
      return false;
    default:
      return assertNever(availability);
  }
}

export const SKILL_SOURCES = [
  "web_app",
  "github",
  "api",
  "local_file",
  "agent",
] as const;

export type SkillSourceType = (typeof SKILL_SOURCES)[number];

export const SkillSourceMetadataSchema = z.object({
  repoUrl: z.string().optional(),
  filePath: z.string(),
});

export type SkillSourceMetadata = z.infer<typeof SkillSourceMetadataSchema>;

// Client-owned key/value labels attached to a skill (akin to Kubernetes labels
// or cloud-resource tags). Dust does not prescribe the keys; external systems
// use them to tag skills they manage and reconcile them without storing sIds.
export const SkillMetadataSchema = z.record(z.string(), z.string());

export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;

export const SkillWithoutInstructionsAndToolsSchema = z.object({
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
  metadata: SkillMetadataSchema.nullable(),
  reinforcement: z.enum(SKILL_REINFORCEMENT_MODES),
  lastReinforcementAnalysisAt: z.string().nullable().optional(),
  selfImprovementLock: z.boolean(),
  selfImprovementCostsCapMicroUsd: z.number().nullable(),
  selfImprovementCostsCapAwuCredits: z.number().nullable(),
  requestedSpaceIds: z.array(z.string()),
  fileAttachments: z.array(
    z.object({
      fileId: z.string(),
      fileName: z.string(),
    })
  ),
  canWrite: z.boolean(),
  canAdministrate: z.boolean(),
  // @deprecated Use availability instead. Kept while old clients still read it.
  isDefault: z.boolean(),
  availability: z.enum(SKILL_AVAILABILITIES),
});

export type SkillWithoutInstructionsAndToolsType = z.infer<
  typeof SkillWithoutInstructionsAndToolsSchema
>;

export const SkillSchema = SkillWithoutInstructionsAndToolsSchema.extend({
  instructions: z.string().nullable(),
  instructionsHtml: z.string().nullable(),
  tools: z.array(MCPServerViewSchema),
});

export type SkillType = z.infer<typeof SkillSchema>;

export type UsedBySkillType = {
  sId: string;
  name: string;
  icon: string | null;
};

export type SkillUsageType = AgentsUsageType & {
  skills: UsedBySkillType[];
};

export type SkillRelations = {
  usage: SkillUsageType;
  editors: UserType[] | null;
  editedByUser: UserType | null;
  childSkills: SkillWithoutInstructionsAndToolsType[];
};

export type SkillWithRelationsType = SkillType & {
  relations: SkillRelations;
};

export type SkillWithoutInstructionsAndToolsWithRelationsType =
  SkillWithoutInstructionsAndToolsType & {
    relations: SkillRelations;
  };

export type SkillWithVersionType = SkillType & {
  version: number;
};
