import { GLOBAL_AGENTS_WORKSPACE_ID } from "@app/lib/agent_search/constants";
import {
  buildAgentSearchQuery,
  MAX_AGENT_SEARCH_FACET_VALUES,
  MAX_AGENT_SEARCH_RESULTS,
  MAX_AGENT_SEARCH_WINDOW,
} from "@app/lib/agent_search/query";
import { buildAgentDefaultSort } from "@app/lib/agent_search/ranking";
import { toAgentListItem } from "@app/lib/agent_search/serialization";
import {
  AGENT_SEARCH_ALIAS_NAME,
  bucketsToArray,
  withEs,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import type {
  AgentSearchDocument,
  AgentSearchFacet,
  AgentSearchFacetValues,
  AgentSearchFilters,
  AgentSearchPermissionFiltering,
  AgentSearchSelectionMode,
  AgentSearchSort,
  AgentSearchSortOrder,
  AgentSearchTermsFacet,
} from "@app/types/agent_search/agent_search";
import type { SearchType } from "@app/types/api/search";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { Err, Ok } from "@app/types/shared/result";
import { isNumber, removeNulls } from "@app/types/shared/utils/general";
import type { estypes } from "@elastic/elasticsearch";

const AGENT_SEARCH_TERMS_FACET_FIELDS: Record<AgentSearchTermsFacet, string> = {
  editors: "editor_ids",
  models: "model.model_id",
  tags: "tag_ids",
  skills: "skill_ids",
  mcpServerViews: "mcp_server_view_ids",
  spaces: "requested_space_ids",
};

type AgentSearchAggregations = Partial<
  Record<AgentSearchTermsFacet, estypes.AggregationsStringTermsAggregate>
> & { usage?: estypes.AggregationsStatsAggregate };

function isTermsFacet(facet: AgentSearchFacet): facet is AgentSearchTermsFacet {
  return facet !== "usage";
}

function buildFacetAggregation(
  facet: AgentSearchFacet
): estypes.AggregationsAggregationContainer {
  return isTermsFacet(facet)
    ? {
        terms: {
          field: AGENT_SEARCH_TERMS_FACET_FIELDS[facet],
          size: MAX_AGENT_SEARCH_FACET_VALUES,
        },
      }
    : { stats: { field: "active_users_count" } };
}

/**
 * @cc [owner:tdraier,label:security;product] searchable-global-agents
 * Global-only searches include disabled defaults for management and return their workspace-resolved
 * status. Other searches require the workspace to resolve them as `active`. In both cases, the
 * caller MUST hold `read` on them (audience).
 */
async function listSearchableGlobalAgents(
  auth: Authenticator,
  includeDisabled: boolean
): Promise<AgentResource[]> {
  const agents = await AgentResource.listGlobalAgents(auth);
  return agents.filter(
    (agent) =>
      (includeDisabled || agent.status === "active") && auth.can("read", agent)
  );
}

/**
 * @cc [owner:tdraier,label:security;performance] indexed-agent-search-listings
 * Return only workspace-scoped or searchable global indexed metadata (see
 * `workspace-scoped-agent-search`); never the agent's instructions. Global eligibility, and the
 * model each searchable global agent resolves to for the workspace, are resolved before the query;
 * result projection must not read the database. Permission-bearing document
 * changes are eventually consistent; full-agent access remains separately authorized.
 * Build the authorized query internally; do not accept caller-supplied Elasticsearch queries.
 * Preserve Elasticsearch hit order without exposing scores.
 * Request _source and omit hits without source documents.
 * Return at most limit agents, and the exact number of matching agents as total.
 */
/**
 * @cc [owner:adrsimon,label:product] agent-search-favorites-first
 * With favoritesFirst, the current user's favorites MUST rank before every other match, each group
 * keeping the requested sort, across pages and without changing which agents match. This legacy
 * ranking option applies only in "all" selection mode.
 */
/**
 * @cc [owner:aubin-tchoi,label:product] agent-search-favorite-selection
 * "favorites_only" restricts the authorized query to the current user's favorites.
 * "favorites_or_all" selects favorites only for empty queries, falling back when no favorites
 * match in total, not merely on the requested page. Nonempty queries and "all" search normally.
 * Filters, facets and pagination apply to the selected results. isFavoritesOnly reports the
 * selected mode. Only favorites selected by "favorites_or_all" default to name sort;
 * otherwise relevance is the default. Explicit sort options take precedence.
 */
/**
 * @cc [owner:tdraier,label:security] unrestricted-agent-search-requires-admin
 * Strict permission filtering is the default. Unrestricted filtering MUST fail with
 * `unrestricted_requires_admin`, without querying, unless the caller is a workspace admin.
 */
/**
 * @cc [owner:tdraier,label:security] agent-search-facets
 * Facet values MUST come from the same authorized query as the returned page (including the
 * caller's filters), so they never reveal values held only by agents the caller cannot list.
 * Terms facets return distinct values, at most MAX_AGENT_SEARCH_FACET_VALUES each, with the number
 * of agents matching that query (every filter included) that hold each value. The `usage` facet
 * returns the min and max `active_users_count` of those agents, null when none has one.
 */
/**
 * @cc [owner:tdraier,label:security;product] agent-search-pagination
 * Custom and global agents share one ES-ranked stream, paginated by offset so any page can be
 * reached directly. `offset + limit` beyond the ES result window MUST fail with
 * `offset_out_of_range` without querying, unless `unrestricted-agent-search-requires-admin`
 * already failed the request (that check takes precedence). Every page re-applies the caller's grants to the indexed
 * documents. Pagination reads the live index; concurrent index changes may cause skips or
 * duplicates.
 */
export async function searchAgents(
  auth: Authenticator,
  {
    limit = MAX_AGENT_SEARCH_RESULTS,
    offset = 0,
    sortBy,
    sortOrder,
    facets = [],
    favoritesFirst = false,
    selectionMode = "all",
    ...options
  }: {
    searchTerm: string;
    searchType?: SearchType;
    facets?: AgentSearchFacet[];
    permissionFiltering?: AgentSearchPermissionFiltering;
    filters?: AgentSearchFilters;
    limit?: number;
    offset?: number;
    sortBy?: AgentSearchSort;
    sortOrder?: AgentSearchSortOrder;
    favoritesFirst?: boolean;
    selectionMode?: AgentSearchSelectionMode;
  }
) {
  if (options.permissionFiltering === "unrestricted" && !auth.isAdmin()) {
    return new Err("unrestricted_requires_admin" as const);
  }

  if (offset + limit > MAX_AGENT_SEARCH_WINDOW) {
    return new Err("offset_out_of_range" as const);
  }

  const isGlobalOnly =
    options.filters?.scope?.length === 1 &&
    options.filters.scope[0] === "global";
  const globalAgents = await listSearchableGlobalAgents(auth, isGlobalOnly);
  const globalAgentsById = new Map(
    globalAgents.map((agent) => [agent.sId, agent.toSearchModelJSON()])
  );
  const globalAgentIds = globalAgents.map((agent) => agent.sId);
  const query = buildAgentSearchQuery(auth, { ...options, globalAgentIds });
  const rankFavoritesFirst = selectionMode === "all" && favoritesFirst;
  const favoriteAgentIds =
    selectionMode === "favorites_only" ||
    (selectionMode === "favorites_or_all" && !options.searchTerm.trim()) ||
    rankFavoritesFirst
      ? await AgentResource.listFavoriteIdsForCurrentUser(auth)
      : [];

  const fetchResults = (restrictToFavorites: boolean) =>
    withEs((client) =>
      client.search<AgentSearchDocument, AgentSearchAggregations>({
        index: AGENT_SEARCH_ALIAS_NAME,
        _source: true,
        query: restrictToFavorites
          ? {
              bool: {
                must: [query],
                filter: [{ terms: { agent_id: favoriteAgentIds } }],
              },
            }
          : query,
        from: offset,
        size: limit,
        track_total_hits: true,
        sort: buildAgentDefaultSort({
          sortBy:
            sortBy ??
            (selectionMode === "favorites_or_all" && restrictToFavorites
              ? "name"
              : "relevance"),
          sortOrder,
          favoriteAgentIds: rankFavoritesFirst ? favoriteAgentIds : [],
        }),
        ...(facets.length > 0
          ? {
              aggs: Object.fromEntries(
                facets.map((facet) => [facet, buildFacetAggregation(facet)])
              ),
            }
          : {}),
      })
    );

  let restrictToFavorites =
    selectionMode === "favorites_only" ||
    (selectionMode === "favorites_or_all" && favoriteAgentIds.length > 0);
  let result = await fetchResults(restrictToFavorites);
  if (result.isErr()) {
    return result;
  }

  const matchingFavorites = result.value.hits.total;
  if (
    selectionMode === "favorites_or_all" &&
    restrictToFavorites &&
    (isNumber(matchingFavorites)
      ? matchingFavorites
      : (matchingFavorites?.value ?? 0)) === 0
  ) {
    restrictToFavorites = false;
    result = await fetchResults(false);
    if (result.isErr()) {
      return result;
    }
  }

  const { hits, total } = result.value.hits;
  const totalCount = isNumber(total) ? total : (total?.value ?? 0);
  const { aggregations } = result.value;
  const facetValues: AgentSearchFacetValues = Object.fromEntries(
    facets.filter(isTermsFacet).map((facet) => [
      facet,
      bucketsToArray(aggregations?.[facet]?.buckets).map((bucket) => ({
        value: String(bucket.key),
        count: bucket.doc_count,
      })),
    ])
  );
  if (facets.includes("usage")) {
    facetValues.usage = {
      min: aggregations?.usage?.min ?? null,
      max: aggregations?.usage?.max ?? null,
    };
  }

  return new Ok({
    agents: removeNulls(hits.map((hit) => hit._source)).map((document) => {
      const globalAgent =
        document.workspace_id === GLOBAL_AGENTS_WORKSPACE_ID
          ? globalAgentsById.get(document.agent_id)
          : undefined;
      const agent = toAgentListItem(document, globalAgent?.model);
      if (isGlobalOnly && globalAgent) {
        agent.status = globalAgent.status;
      }
      return agent;
    }),
    total: totalCount,
    hasMore: offset + hits.length < totalCount,
    isFavoritesOnly: restrictToFavorites,
    facets: facetValues,
  });
}

/**
 * @cc [owner:tdraier,label:product;security] agent-name-resolution
 * Resolves a user- or model-supplied agent name to the sId of an active agent the caller can
 * `read`, or null when none matches or the name is blank. "dust" and "dust agent" (trimmed,
 * case-insensitive) resolve to the Dust global agent; any other name MUST match an agent's name
 * exactly, ignoring case (see `agent-fetch-by-name`): a partial or approximate name resolves to
 * nothing, never to a guess.
 */
export async function resolveAgentIdByName(
  auth: Authenticator,
  agentName: string
): Promise<string | null> {
  const trimmedName = agentName.trim();
  if (trimmedName.length === 0) {
    return null;
  }

  const normalizedName = trimmedName.toLowerCase();
  const agent =
    normalizedName === "dust" || normalizedName === "dust agent"
      ? await AgentResource.fetchById(auth, GLOBAL_AGENTS_SID.DUST)
      : await AgentResource.fetchByName(auth, trimmedName);

  return agent && agent.status === "active" && auth.can("read", agent)
    ? agent.sId
    : null;
}
