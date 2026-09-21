import { MAX_SKILL_SEARCH_RESULTS } from "@app/lib/skill_search/query";
import { SKILL_AVAILABILITIES } from "@app/types/assistant/skill_configuration_constants";
import { z } from "zod";

export const SearchSkillsQuerySchema = z.object({
  query: z.string().max(200).optional().default(""),
  limit: z.number().int().min(1).max(MAX_SKILL_SEARCH_RESULTS).optional(),
  cursor: z.string().nullish(),
  permissionFiltering: z.enum(["strict", "redact_unreadable"]).optional(),
  status: z
    .array(z.enum(["active", "archived"]))
    .min(1)
    .max(2)
    .optional(),
  mcpServerViewIds: z.array(z.string().min(1)).max(100).optional(),
  availability: z
    .array(z.enum(SKILL_AVAILABILITIES))
    .max(SKILL_AVAILABILITIES.length)
    .optional(),
  editedByMe: z.literal(true).optional(),
});
