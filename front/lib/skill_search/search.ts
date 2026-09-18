import {
  ElasticsearchError,
  SKILL_SEARCH_ALIAS_NAME,
  withEs,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { SkillSearchSort } from "@app/lib/skill_search/query";
import { toSkillListItem } from "@app/lib/skill_search/serialization";
import type { SkillSearchResult } from "@app/types/api/skills";
import { Err, Ok } from "@app/types/shared/result";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";
import type { estypes } from "@elastic/elasticsearch";

export type { SkillSearchSort } from "@app/lib/skill_search/query";
export {
  MAX_SKILL_SEARCH_RESULTS,
  buildSkillSearchQuery,
  SkillSearchSortSchema,
} from "@app/lib/skill_search/query";

export interface SkillSearchCandidate {
  skill: SkillSearchResult;
  sort: SkillSearchSort;
}

/**
 * @cc [owner:aubin-tchoi,label:security;performance] indexed-skill-search-listings
 * Return only workspace-scoped indexed metadata using the caller's hydrated grants, with no
 * database reads. Permission-bearing document changes are eventually consistent; full-skill
 * access remains separately authorized. Unreadable listings must not be returned.
 * Callers must use buildSkillSearchQuery to enforce permissions in Elasticsearch.
 */
export async function searchSkills(
  auth: Authenticator,
  {
    query,
    searchAfter,
    limit,
  }: {
    query: estypes.QueryDslQueryContainer;
    searchAfter: SkillSearchSort | null;
    limit: number;
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

  const { hits } = result.value.hits;

  const candidates: SkillSearchCandidate[] = [];
  for (const hit of hits) {
    const document = hit._source;
    if (!document) {
      return new Err(
        new ElasticsearchError("query_error", "Missing skill search document")
      );
    }

    const [score, name, skillId] = hit.sort!;
    candidates.push({
      sort: [score, name, skillId],
      skill: { ...toSkillListItem(document), score },
    });
  }

  return new Ok({
    candidates,
    exhausted: hits.length < limit,
  });
}
