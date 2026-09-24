import { MAX_AGENT_SEARCH_RESULTS } from "@app/lib/agent_search/query";
import {
  AGENT_SEARCH_PERMISSION_FILTERINGS,
  AGENT_SEARCH_SORT_ORDERS,
  AGENT_SEARCH_SORTS,
} from "@app/types/agent_search/agent_search";
import { z } from "zod";

export const SearchAgentsQuerySchema = z.object({
  query: z.string().max(200).optional().default(""),
  limit: z.number().int().min(1).max(MAX_AGENT_SEARCH_RESULTS).optional(),
  cursor: z.string().nullish(),
  permissionFiltering: z.enum(AGENT_SEARCH_PERMISSION_FILTERINGS).optional(),
  status: z
    .array(z.enum(["active", "archived"]))
    .min(1)
    .max(2)
    .optional(),
  scope: z
    .array(z.enum(["visible", "hidden"]))
    .min(1)
    .max(2)
    .optional(),
  tagIds: z.array(z.string().min(1)).max(100).optional(),
  skillIds: z.array(z.string().min(1)).max(100).optional(),
  mcpServerViewIds: z.array(z.string().min(1)).max(100).optional(),
  editedByMe: z.literal(true).optional(),
  sortBy: z.enum(AGENT_SEARCH_SORTS).optional(),
  sortOrder: z.enum(AGENT_SEARCH_SORT_ORDERS).optional(),
});
