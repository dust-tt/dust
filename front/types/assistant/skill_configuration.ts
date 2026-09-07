import { MCPServerViewSchema } from "@app/lib/api/mcp_schemas";
import type { SkillAvailability } from "@app/types/assistant/skill_configuration_constants";
import {
  SKILL_AVAILABILITIES,
  SKILL_STATUSES,
} from "@app/types/assistant/skill_configuration_constants";
import type { AgentsAndSkillsUsageType } from "@app/types/data_source";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { UserType } from "@app/types/user";
import { z } from "zod";

export const SKILL_REINFORCEMENT_MODES = ["auto", "on", "off"] as const;
export type SkillReinforcementMode = (typeof SKILL_REINFORCEMENT_MODES)[number];

export type {
  SkillAvailability,
  SkillStatus,
} from "@app/types/assistant/skill_configuration_constants";
// Re-exported from the leaf module so importers do not have to care which file they live in.
export {
  DEFAULT_SKILL_AVAILABILITY,
  SKILL_AVAILABILITIES,
  SKILL_STATUSES,
} from "@app/types/assistant/skill_configuration_constants";

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
  reinforcement: z.enum(SKILL_REINFORCEMENT_MODES),
  lastReinforcementAnalysisAt: z.string().nullable().optional(),
  selfImprovementLock: z.boolean(),
  selfImprovementCostsCapMicroUsd: z.number().nullable(),
  selfImprovementCostsCapAwuCredits: z.number().nullable(),
  requestedSpaceIds: z.array(z.string()),
  // The subset of `requestedSpaceIds` picked by hand under "Data and access". Optional so older
  // clients that do not send it back are still accepted.
  manuallyRequestedSpaceIds: z.array(z.string()).optional(),
  fileAttachments: z.array(
    z.object({
      fileId: z.string(),
      fileName: z.string(),
    })
  ),
  // False when the private fields (instructions, tools, files) were redacted: an admin listing a
  // skill built on a space they are not a member of.
  canRead: z.boolean(),
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

export type SkillRelations = {
  usage: AgentsAndSkillsUsageType;
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
