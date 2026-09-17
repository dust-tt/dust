import {
  ElasticsearchError,
  SKILL_SEARCH_ALIAS_NAME,
  withEs,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { SkillSearchSort } from "@app/lib/skill_search/query";
import {
  getSkillSearchReadableSpaceIds,
  SkillSearchSortSchema,
} from "@app/lib/skill_search/query";
import { toSkillListItem } from "@app/lib/skill_search/serialization";
import type {
  SkillSearchFilters,
  SkillSearchResult,
} from "@app/types/api/skills";
import { Err, Ok } from "@app/types/shared/result";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";
import type { estypes } from "@elastic/elasticsearch";

export type { SkillSearchSort } from "@app/lib/skill_search/query";
export {
  MAX_SKILL_SEARCH_RESULTS,
  prepareSkillSearchQuery,
  SkillSearchSortSchema,
} from "@app/lib/skill_search/query";

export interface SkillSearchCandidate {
  // Rejected hits retain their position so a page of denied hits can advance.
  skill: SkillSearchResult | null;
  sort: SkillSearchSort;
}

/**
 * @cc [owner:aubin-tchoi,label:security;performance] indexed-skill-search-listings
 * Return only workspace-scoped indexed metadata using the caller's hydrated grants, with no
 * database reads. Permission-bearing document changes are eventually consistent; full-skill
 * access remains separately authorized. Unreadable listings must not be returned.
 */
export async function searchSkills(
  auth: Authenticator,
  {
    query,
    searchAfter,
    limit,
    status = ["active"],
  }: {
    query: estypes.QueryDslQueryContainer;
    searchAfter: SkillSearchSort | null;
    limit: number;
    status?: SkillSearchFilters["status"];
  }
) {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const result = await withEs((client) =>
    client.search<SkillSearchDocument>({
      index: SKILL_SEARCH_ALIAS_NAME,
      _source: true,
      query: {
        bool: {
          filter: [{ term: { workspace_id: workspaceId } }],
          must: [query],
        },
      },
      size: limit,
      sort: [
        { _score: { order: "desc" } },
        { "name.keyword": { order: "asc" } },
        { skill_id: { order: "asc" } },
      ],
      ...(searchAfter ? { search_after: searchAfter } : {}),
    })
  );
  if (result.isErr()) {
    return result;
  }
  const hits = result.value.hits.hits;
  const sorts = SkillSearchSortSchema.array().safeParse(
    hits.map((hit) => hit.sort)
  );
  if (!sorts.success) {
    return new Err(
      new ElasticsearchError("query_error", "Missing skill search sort values")
    );
  }
  const spaceIds = getSkillSearchReadableSpaceIds(auth);
  const readableSpaceIds = spaceIds === null ? null : new Set(spaceIds);
  const userId = auth.getNonNullableUser().sId;
  const candidates: SkillSearchCandidate[] = [];
  for (const [index, hit] of hits.entries()) {
    const document = hit._source;
    if (!document) {
      return new Err(
        new ElasticsearchError("query_error", "Missing skill search document")
      );
    }
    const sort = sorts.data[index];
    const canRead = document.requested_space_ids.every(
      (id) => readableSpaceIds === null || readableSpaceIds.has(id)
    );
    const visible =
      document.workspace_id === workspaceId &&
      document.skill_id === sort[2] &&
      status.some((value) => value === document.status) &&
      canRead &&
      (document.availability !== "editors" ||
        document.editor_ids.includes(userId));
    candidates.push({
      sort,
      skill: visible ? { ...toSkillListItem(document), score: sort[0] } : null,
    });
  }
  return new Ok({
    candidates,
    exhausted: hits.length < limit,
  });
}
