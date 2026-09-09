import { MAX_RESOURCE_SEARCH_RESULTS } from "@app/lib/search/resource_query";
import { SKILL_AVAILABILITIES } from "@app/types/assistant/skill_configuration_constants";
import { SEARCH_MODES, SEARCH_RESOURCE_TYPES } from "@app/types/search";
import { z } from "zod";

const IdListSchema = z
  .string()
  .max(10_000)
  .transform((value) => value.split(","))
  .pipe(z.array(z.string().min(1)).max(100));
const BooleanFilterSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

export const SearchSkillsQuerySchema = z.object({
  query: z.string().max(200).optional().default(""),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_RESOURCE_SEARCH_RESULTS)
    .optional(),
  cursor: z.string().uuid().optional(),
  permissionFiltering: z.enum(["strict", "redact_unreadable"]).optional(),
  mode: z.enum(SEARCH_MODES).optional(),
  spaceIds: IdListSchema.optional(),
  toolIds: IdListSchema.optional(),
  availability: z
    .string()
    .transform((value) => value.split(","))
    .pipe(
      z.array(z.enum(SKILL_AVAILABILITIES)).max(SKILL_AVAILABILITIES.length)
    )
    .optional(),
  isDefault: BooleanFilterSchema.optional(),
  editedByMe: BooleanFilterSchema.optional(),
});

export const ResourceSearchQuerySchema = SearchSkillsQuerySchema.extend({
  resourceTypes: z
    .string()
    .transform((value) => value.split(","))
    .pipe(z.array(z.enum(SEARCH_RESOURCE_TYPES)).min(1).max(2))
    .optional(),
  tagIds: IdListSchema.optional(),
  skillIds: IdListSchema.optional(),
});
