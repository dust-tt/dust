import { MAX_AGENT_SEARCH_RESULTS } from "@app/lib/agent_search/constants";
import {
  AGENT_SEARCH_FACETS,
  AGENT_SEARCH_PERMISSION_FILTERINGS,
  AGENT_SEARCH_SELECTION_MODES,
  AGENT_SEARCH_SORT_ORDERS,
  AGENT_SEARCH_SORTS,
} from "@app/types/agent_search/agent_search";
import { SEARCH_TYPES } from "@app/types/api/search";
import { AGENT_CONFIGURATION_SCOPES } from "@app/types/assistant/agent";
import { z } from "zod";

export const BaseSearchAgentsSchema = z.object({
  status: z
    .array(z.enum(["active", "archived"]))
    .min(1)
    .max(2)
    .optional()
    .describe(
      "Return agents with one of these statuses. Defaults to active. For global-only searches, active also includes workspace-disabled defaults."
    ),
  scope: z
    .array(z.enum(AGENT_CONFIGURATION_SCOPES))
    .min(1)
    .max(AGENT_CONFIGURATION_SCOPES.length)
    .optional()
    .describe(
      "Filter by agent scope: global for Dust built-ins, visible for published agents, hidden for unpublished agents. Matches any listed scope. Global-only searches also include disabled defaults and return their workspace-resolved status."
    ),
  tagIds: z
    .array(z.string().min(1))
    .max(100)
    .optional()
    .describe("Filter by tag IDs. Matches any listed ID."),
  skillIds: z
    .array(z.string().min(1))
    .max(100)
    .optional()
    .describe("Filter by equipped skill IDs. Matches any listed ID."),
  mcpServerViewIds: z
    .array(z.string().min(1))
    .max(100)
    .optional()
    .describe("Filter by equipped tool view IDs. Matches any listed ID."),
  editorIds: z
    .array(z.string().min(1))
    .max(100)
    .optional()
    .describe("Filter by editor user IDs. Matches any listed ID."),
  modelIds: z
    .array(z.string().min(1))
    .max(100)
    .optional()
    .describe("Filter by model IDs. Matches any listed ID."),
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
  editedByMe: z
    .literal(true)
    .optional()
    .describe(
      "Only return entities edited by the current user. Returns no results without an interactive user."
    ),
});

export const SearchAgentsQuerySchema = BaseSearchAgentsSchema.extend({
  query: z.string().max(200).optional().default(""),
  searchType: z.enum(SEARCH_TYPES).optional().default("autocomplete"),
  limit: z.number().int().min(0).max(MAX_AGENT_SEARCH_RESULTS).optional(),
  offset: z.number().int().min(0).optional(),
  permissionFiltering: z.enum(AGENT_SEARCH_PERMISSION_FILTERINGS).optional(),
  facets: z
    .array(z.enum(AGENT_SEARCH_FACETS))
    .max(AGENT_SEARCH_FACETS.length)
    .optional(),
  sortBy: z.enum(AGENT_SEARCH_SORTS).optional(),
  sortOrder: z.enum(AGENT_SEARCH_SORT_ORDERS).optional(),
  favoritesFirst: z.boolean().optional(),
  selectionMode: z
    .enum(AGENT_SEARCH_SELECTION_MODES)
    .optional()
    .describe(
      "all searches normally; favorites_only searches only favorites; favorites_or_all prefers favorites for empty queries and searches normally if none match. Defaults to all."
    ),
});
