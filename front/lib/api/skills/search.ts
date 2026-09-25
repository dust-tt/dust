import {
  bucketsToArray,
  SKILL_SEARCH_ALIAS_NAME,
  withEs,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import {
  buildSkillSearchQuery,
  MAX_SKILL_SEARCH_FACET_VALUES,
  MAX_SKILL_SEARCH_RESULTS,
  MAX_SKILL_SEARCH_WINDOW,
} from "@app/lib/skill_search/query";
import { buildSkillDefaultSort } from "@app/lib/skill_search/ranking";
import { toSkillListItem } from "@app/lib/skill_search/serialization";
import type {
  SkillSearchFacet,
  SkillSearchFacetValues,
  SkillSearchFilters,
  SkillSearchPermissionFiltering,
  SkillSearchSort,
  SkillSearchSortOrder,
  SkillSearchTermsFacet,
} from "@app/types/api/skills";
import { Err, Ok } from "@app/types/shared/result";
import { isNumber, removeNulls } from "@app/types/shared/utils/general";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";
import type { estypes } from "@elastic/elasticsearch";

const SKILL_SEARCH_TERMS_FACET_FIELDS: Record<SkillSearchTermsFacet, string> = {
  availability: "availability",
  editors: "editor_ids",
  childSkills: "child_skill_ids",
  spaces: "requested_space_ids",
};

type SkillSearchAggregations = Partial<
  Record<SkillSearchTermsFacet, estypes.AggregationsStringTermsAggregate>
> & { usage?: estypes.AggregationsStatsAggregate };

function isTermsFacet(facet: SkillSearchFacet): facet is SkillSearchTermsFacet {
  return facet !== "usage";
}

function buildFacetAggregation(
  facet: SkillSearchFacet
): estypes.AggregationsAggregationContainer {
  return isTermsFacet(facet)
    ? {
        terms: {
          field: SKILL_SEARCH_TERMS_FACET_FIELDS[facet],
          size: MAX_SKILL_SEARCH_FACET_VALUES,
        },
      }
    : { stats: { field: "active_users_count" } };
}

/**
 * @cc [owner:aubin-tchoi,label:security;performance] indexed-skill-search-listings
 * Return only workspace-scoped or eligible code-defined indexed metadata using hydrated grants.
 * Result projection must not read the database; code-defined eligibility is resolved before the query.
 * Administration permissions come from hydrated grants, not indexed editors; code-defined skills cannot be administrated.
 * Permission-bearing document changes are eventually consistent; full-skill
 * access remains separately authorized. Callers must authorize admin-only redaction upstream.
 * Build the authorized query internally; do not accept caller-supplied Elasticsearch queries.
 * Preserve Elasticsearch hit order without exposing scores or readability flags in skill listings.
 * Request _source and omit hits without source documents.
 * Return at most limit skills, and the exact number of matching skills as total.
 */

/**
 * @cc [owner:tdraier,label:security] skill-search-facets
 * Facet values MUST come from the same authorized query as the returned page (including the
 * caller's filters), so they never reveal values held only by skills the caller cannot list.
 * Terms facets return distinct values, at most MAX_SKILL_SEARCH_FACET_VALUES each, with the number
 * of skills matching that query (every filter included) that hold each value. The `usage` facet
 * returns the min and max `active_users_count` of those skills, null when none has one.
 */
/**
 * @cc [owner:aubin-tchoi,label:security;product] unified-search-pagination
 * Custom and code-defined skills share one ES-ranked stream, paginated by offset so any page can
 * be reached directly. `offset + limit` beyond the ES result window MUST fail with
 * `offset_out_of_range` without querying. Every page applies hydrated grants to indexed
 * requirements. Pagination reads the live index; concurrent index changes may cause skips or
 * duplicates.
 */
export async function searchSkills(
  auth: Authenticator,
  {
    limit = MAX_SKILL_SEARCH_RESULTS,
    offset = 0,
    sortBy,
    sortOrder,
    facets = [],
    ...options
  }: {
    searchTerm: string;
    facets?: SkillSearchFacet[];
    filters?: SkillSearchFilters;
    permissionFiltering?: SkillSearchPermissionFiltering;
    limit?: number;
    offset?: number;
    sortBy?: SkillSearchSort;
    sortOrder?: SkillSearchSortOrder;
  }
) {
  if (offset + limit > MAX_SKILL_SEARCH_WINDOW) {
    return new Err("offset_out_of_range" as const);
  }

  const codeDefinedSkillIds =
    await SkillResource.listAvailableCodeDefinedIds(auth);
  const query = buildSkillSearchQuery(auth, {
    ...options,
    codeDefinedSkillIds,
  });

  const result = await withEs((client) =>
    client.search<SkillSearchDocument, SkillSearchAggregations>({
      index: SKILL_SEARCH_ALIAS_NAME,
      _source: true,
      query,
      from: offset,
      size: limit,
      track_total_hits: true,
      sort: buildSkillDefaultSort({ sortBy, sortOrder }),
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
  const facetValues: SkillSearchFacetValues = Object.fromEntries(
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
    skills: removeNulls(hits.map((hit) => hit._source)).map((document) =>
      toSkillListItem(auth, document)
    ),
    total: totalCount,
    hasMore: offset + hits.length < totalCount,
    facets: facetValues,
  });
}
