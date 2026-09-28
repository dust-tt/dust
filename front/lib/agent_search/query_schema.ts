import { MAX_AGENT_SEARCH_RESULTS } from "@app/lib/agent_search/query";
import {
  AGENT_SEARCH_FACETS,
  AGENT_SEARCH_PERMISSION_FILTERINGS,
  AGENT_SEARCH_SORT_ORDERS,
  AGENT_SEARCH_SORTS,
} from "@app/types/agent_search/agent_search";
import { AGENT_CONFIGURATION_SCOPES } from "@app/types/assistant/agent";
import { z } from "zod";

export const SearchAgentsQuerySchema = z.object({
  query: z.string().max(200).optional().default(""),
  limit: z.number().int().min(0).max(MAX_AGENT_SEARCH_RESULTS).optional(),
  offset: z.number().int().min(0).optional(),
  permissionFiltering: z.enum(AGENT_SEARCH_PERMISSION_FILTERINGS).optional(),
  status: z
    .array(z.enum(["active", "archived"]))
    .min(1)
    .max(2)
    .optional(),
  scope: z
    .array(z.enum(AGENT_CONFIGURATION_SCOPES))
    .min(1)
    .max(AGENT_CONFIGURATION_SCOPES.length)
    .optional(),
  tagIds: z.array(z.string().min(1)).max(100).optional(),
  skillIds: z.array(z.string().min(1)).max(100).optional(),
  mcpServerViewIds: z.array(z.string().min(1)).max(100).optional(),
  editorIds: z.array(z.string().min(1)).max(100).optional(),
  modelIds: z.array(z.string().min(1)).max(100).optional(),
  spaceIds: z.array(z.string().min(1)).max(100).optional(),
  activeUsersCount: z
    .object({
      min: z.number().int().min(0).optional(),
      max: z.number().int().min(0).optional(),
    })
    .optional(),
  editedByMe: z.literal(true).optional(),
  facets: z
    .array(z.enum(AGENT_SEARCH_FACETS))
    .max(AGENT_SEARCH_FACETS.length)
    .optional(),
  sortBy: z.enum(AGENT_SEARCH_SORTS).optional(),
  sortOrder: z.enum(AGENT_SEARCH_SORT_ORDERS).optional(),
});
