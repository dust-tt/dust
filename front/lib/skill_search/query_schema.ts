import { MAX_SKILL_SEARCH_RESULTS } from "@app/lib/skill_search/constants";
import { SEARCH_TYPES } from "@app/types/api/search";
import {
  SKILL_SEARCH_FACETS,
  SKILL_SEARCH_FAVORITES_MODES,
  SKILL_SEARCH_SORT_ORDERS,
  SKILL_SEARCH_SORTS,
} from "@app/types/api/skills";
import { SKILL_AVAILABILITIES } from "@app/types/assistant/skill_configuration_constants";
import { z } from "zod";

export const BaseSearchSkillsSchema = z.object({
  status: z
    .array(z.enum(["active", "archived"]))
    .min(1)
    .max(2)
    .optional()
    .describe("Return skills with one of these statuses. Defaults to active."),
  mcpServerViewIds: z
    .array(z.string().min(1))
    .max(100)
    .optional()
    .describe("Filter by equipped tool view IDs. Matches any listed ID."),
  availability: z
    .array(z.enum(SKILL_AVAILABILITIES))
    .max(SKILL_AVAILABILITIES.length)
    .optional()
    .describe(
      "Filter by skill availability: editors for unpublished skills, workspace_users for skills users can enable, users_and_agents for skills also discoverable by agents."
    ),
  editedByMe: z
    .literal(true)
    .optional()
    .describe(
      "Only return entities edited by the current user. Returns no results without an interactive user."
    ),
  codeDefinedOnly: z
    .boolean()
    .optional()
    .describe(
      "True returns only Dust built-in skills; false returns only workspace skills. Omit to include both."
    ),
  editorIds: z
    .array(z.string().min(1))
    .max(100)
    .optional()
    .describe("Filter by editor user IDs. Matches any listed ID."),
  childSkillIds: z
    .array(z.string().min(1))
    .max(100)
    .optional()
    .describe(
      "Filter by directly referenced child skill IDs. Matches any listed ID."
    ),
  spaceIds: z
    .array(z.string().min(1))
    .max(100)
    .optional()
    .describe(
      "Filter by requested knowledge space IDs. Matches any listed ID."
    ),
  activeUsersCount: z
    .object({
      min: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Inclusive minimum active-user count."),
      max: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Inclusive maximum active-user count."),
    })
    .optional()
    .describe(
      "Filter by the number of active users, using inclusive minimum and maximum bounds."
    ),
});

export const SearchSkillsQuerySchema = BaseSearchSkillsSchema.extend({
  query: z.string().max(200).optional().default(""),
  searchType: z.enum(SEARCH_TYPES).optional().default("autocomplete"),
  limit: z.number().int().min(0).max(MAX_SKILL_SEARCH_RESULTS).optional(),
  offset: z.number().int().min(0).optional(),
  permissionFiltering: z.enum(["strict", "redact_unreadable"]).optional(),
  facets: z
    .array(z.enum(SKILL_SEARCH_FACETS))
    .max(SKILL_SEARCH_FACETS.length)
    .optional(),
  sortBy: z.enum(SKILL_SEARCH_SORTS).optional(),
  sortOrder: z.enum(SKILL_SEARCH_SORT_ORDERS).optional(),
  // "none" leaves favorites unfiltered; it does not exclude them.
  favoritesMode: z.enum(SKILL_SEARCH_FAVORITES_MODES).optional(),
  // @deprecated Older clients request blank-query favorites through this boolean.
  // TODO: Remove once older clients stop sending defaultToFavorites.
  defaultToFavorites: z.boolean().optional(),
  // Only excluded from the default favorites list; ordinary search behavior is unchanged.
  excludeSkillId: z.string().min(1).optional(),
});
