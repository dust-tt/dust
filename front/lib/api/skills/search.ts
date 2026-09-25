import { SKILL_SEARCH_ALIAS_NAME, withEs } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import {
  buildSkillSearchQuery,
  MAX_SKILL_SEARCH_RESULTS,
  MAX_SKILL_SEARCH_WINDOW,
} from "@app/lib/skill_search/query";
import { buildSkillDefaultSort } from "@app/lib/skill_search/ranking";
import { toSkillListItem } from "@app/lib/skill_search/serialization";
import type {
  SkillSearchFilters,
  SkillSearchPermissionFiltering,
  SkillSearchSort,
  SkillSearchSortOrder,
} from "@app/types/api/skills";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";

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
    ...options
  }: {
    searchTerm: string;
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
    client.search<SkillSearchDocument>({
      index: SKILL_SEARCH_ALIAS_NAME,
      _source: true,
      query,
      from: offset,
      size: limit,
      track_total_hits: true,
      sort: buildSkillDefaultSort({ sortBy, sortOrder }),
    })
  );
  if (result.isErr()) {
    return result;
  }
  const { hits, total } = result.value.hits;
  const totalCount = typeof total === "number" ? total : (total?.value ?? 0);

  return new Ok({
    skills: removeNulls(hits.map((hit) => hit._source)).map((document) =>
      toSkillListItem(auth, document)
    ),
    total: totalCount,
    hasMore: offset + hits.length < totalCount,
  });
}
