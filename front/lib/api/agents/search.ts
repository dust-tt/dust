import {
  buildAgentSearchQuery,
  MAX_AGENT_SEARCH_RESULTS,
} from "@app/lib/agent_search/query";
import { buildAgentDefaultSort } from "@app/lib/agent_search/ranking";
import { toAgentListItem } from "@app/lib/agent_search/serialization";
import { listDefaultGlobalAgentIds } from "@app/lib/api/assistant/global_agents/global_agents";
import { AGENT_SEARCH_ALIAS_NAME, withEs } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import type {
  AgentSearchDocument,
  AgentSearchFilters,
  AgentSearchPermissionFiltering,
  AgentSearchSort,
  AgentSearchSortOrder,
} from "@app/types/agent_search/agent_search";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import type { estypes } from "@elastic/elasticsearch";
import { z } from "zod";

const AgentSearchSortSchema = z.array(
  z.union([z.string(), z.number(), z.boolean(), z.null()])
);

/**
 * @cc [owner:tdraier,label:security;product] searchable-global-agents
 * Global agents are searchable only when the workspace resolves them as `active` (not disabled by
 * an admin, a missing data source or the plan) and the caller holds `read` on them (audience).
 */
async function listSearchableGlobalAgentIds(
  auth: Authenticator
): Promise<string[]> {
  const agents = await AgentResource.fetchByIds(
    auth,
    listDefaultGlobalAgentIds()
  );
  return agents
    .filter((agent) => agent.status === "active" && auth.can("read", agent))
    .map((agent) => agent.sId);
}

/**
 * @cc [owner:tdraier,label:security;performance] indexed-agent-search-listings
 * Return only workspace-scoped or searchable global indexed metadata (see
 * `workspace-scoped-agent-search`); never the agent's instructions. Global eligibility is resolved
 * before the query and result projection must not read the database. Permission-bearing document
 * changes are eventually consistent; full-agent access remains separately authorized.
 * Build the authorized query internally; do not accept caller-supplied Elasticsearch queries.
 * Preserve Elasticsearch hit order without exposing scores.
 * Request _source and omit hits without source documents.
 * Return at most limit agents; nextCursor must point to the last consumed hit, not the lookahead.
 */
/**
 * @cc [owner:tdraier,label:security] unrestricted-agent-search-requires-admin
 * Strict permission filtering is the default. Unrestricted filtering MUST fail with
 * `unrestricted_requires_admin`, without querying, unless the caller is a workspace admin.
 */
/**
 * @cc [owner:tdraier,label:security;product] agent-search-pagination
 * Custom and global agents share one ES-ranked stream; cursors advance only past consumed hits.
 * Cursors encode the ES sort tuple as an opaque string and convey no authorization.
 * Callers reset the cursor when changing the query, filters, or sort order.
 * Every page re-applies the caller's grants to the indexed documents.
 * Pagination reads the live index; concurrent index changes may cause skips or duplicates.
 */
export async function searchAgents(
  auth: Authenticator,
  {
    limit = MAX_AGENT_SEARCH_RESULTS,
    cursor,
    sortBy,
    sortOrder,
    ...options
  }: {
    searchTerm: string;
    permissionFiltering?: AgentSearchPermissionFiltering;
    filters?: AgentSearchFilters;
    limit?: number;
    cursor?: string | null;
    sortBy?: AgentSearchSort;
    sortOrder?: AgentSearchSortOrder;
  }
) {
  if (options.permissionFiltering === "unrestricted" && !auth.isAdmin()) {
    return new Err("unrestricted_requires_admin" as const);
  }

  let searchAfter: estypes.SortResults | undefined;
  if (cursor !== undefined && cursor !== null) {
    const parsed = safeParseJSON(
      Buffer.from(cursor, "base64url").toString("utf8")
    );
    const sort = AgentSearchSortSchema.safeParse(
      parsed.isOk() ? parsed.value : undefined
    );
    if (!sort.success) {
      return new Err("invalid_cursor" as const);
    }
    searchAfter = sort.data;
  }

  const globalAgentIds = await listSearchableGlobalAgentIds(auth);
  const query = buildAgentSearchQuery(auth, { ...options, globalAgentIds });

  const result = await withEs((client) =>
    client.search<AgentSearchDocument>({
      index: AGENT_SEARCH_ALIAS_NAME,
      _source: true,
      query,
      size: limit + 1,
      sort: buildAgentDefaultSort({ sortBy, sortOrder }),
      ...(searchAfter ? { search_after: searchAfter } : {}),
    })
  );
  if (result.isErr()) {
    return result;
  }
  const { hits } = result.value.hits;
  const pageHits = hits.slice(0, limit);
  const nextCursor = pageHits.at(-1)?.sort;

  return new Ok({
    agents: removeNulls(pageHits.map((hit) => hit._source)).map(
      toAgentListItem
    ),
    hasMore: hits.length > limit,
    nextCursor: nextCursor
      ? Buffer.from(JSON.stringify(nextCursor)).toString("base64url")
      : null,
  });
}
