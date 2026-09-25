import { GLOBAL_AGENTS_WORKSPACE_ID } from "@app/lib/agent_search/constants";
import {
  buildAgentSearchQuery,
  MAX_AGENT_SEARCH_FACET_VALUES,
  MAX_AGENT_SEARCH_RESULTS,
  MAX_AGENT_SEARCH_WINDOW,
} from "@app/lib/agent_search/query";
import { buildAgentDefaultSort } from "@app/lib/agent_search/ranking";
import { toAgentListItem } from "@app/lib/agent_search/serialization";
import { listDefaultGlobalAgentIds } from "@app/lib/api/assistant/global_agents/global_agents";
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
  AgentSearchSort,
  AgentSearchSortOrder,
  AgentSearchTermsFacet,
} from "@app/types/agent_search/agent_search";
import { Err, Ok } from "@app/types/shared/result";
import { isNumber, removeNulls } from "@app/types/shared/utils/general";
import type { estypes } from "@elastic/elasticsearch";

const AGENT_SEARCH_TERMS_FACET_FIELDS: Record<AgentSearchTermsFacet, string> = {
  editors: "editor_ids",
  models: "model.model_id",
  tags: "tag_ids",
  skills: "skill_ids",
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
 * Global agents are searchable only when the workspace resolves them as `active` (not disabled by
 * an admin, a missing data source or the plan) and the caller holds `read` on them (audience).
 */
async function listSearchableGlobalAgents(
  auth: Authenticator
): Promise<AgentResource[]> {
  const agents = await AgentResource.fetchByIds(
    auth,
    listDefaultGlobalAgentIds()
  );
  return agents.filter(
    (agent) => agent.status === "active" && auth.can("read", agent)
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
    ...options
  }: {
    searchTerm: string;
    facets?: AgentSearchFacet[];
    permissionFiltering?: AgentSearchPermissionFiltering;
    filters?: AgentSearchFilters;
    limit?: number;
    offset?: number;
    sortBy?: AgentSearchSort;
    sortOrder?: AgentSearchSortOrder;
  }
) {
  if (options.permissionFiltering === "unrestricted" && !auth.isAdmin()) {
    return new Err("unrestricted_requires_admin" as const);
  }

  if (offset + limit > MAX_AGENT_SEARCH_WINDOW) {
    return new Err("offset_out_of_range" as const);
  }

  const globalAgents = await listSearchableGlobalAgents(auth);
  const globalAgentIds = globalAgents.map((agent) => agent.sId);
  const globalAgentModels = new Map(
    globalAgents.map((agent) => [agent.sId, agent.toSearchModelJSON()])
  );
  const query = buildAgentSearchQuery(auth, { ...options, globalAgentIds });

  const result = await withEs((client) =>
    client.search<AgentSearchDocument, AgentSearchAggregations>({
      index: AGENT_SEARCH_ALIAS_NAME,
      _source: true,
      query,
      from: offset,
      size: limit,
      track_total_hits: true,
      sort: buildAgentDefaultSort({ sortBy, sortOrder }),
      ...(facets.length > 0
        ? {
            aggs: Object.fromEntries(
              facets.map((facet) => [facet, buildFacetAggregation(facet)])
            ),
          }
        : {}),
    })
  );
  if (result.isErr()) {
    return result;
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
    agents: removeNulls(hits.map((hit) => hit._source)).map((document) =>
      toAgentListItem(
        document,
        document.workspace_id === GLOBAL_AGENTS_WORKSPACE_ID
          ? globalAgentModels.get(document.agent_id)
          : null
      )
    ),
    total: totalCount,
    hasMore: offset + hits.length < totalCount,
    facets: facetValues,
  });
}
