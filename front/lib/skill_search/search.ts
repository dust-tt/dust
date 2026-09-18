import { SKILL_SEARCH_ALIAS_NAME, withEs } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { buildSkillSearchQuery } from "@app/lib/skill_search/query";
import { buildSkillDefaultSort } from "@app/lib/skill_search/ranking";
import { toSkillListItem } from "@app/lib/skill_search/serialization";
import type { SkillSearchFilters } from "@app/types/api/skills";
import { Ok } from "@app/types/shared/result";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";

export {
  buildSkillSearchQuery,
  MAX_SKILL_SEARCH_RESULTS,
} from "@app/lib/skill_search/query";

/**
 * @cc [owner:aubin-tchoi,label:security;performance] indexed-skill-search-listings
 * Return only workspace-scoped indexed metadata using the caller's hydrated grants, with no
 * database reads. Permission-bearing document changes are eventually consistent; full-skill
 * access remains separately authorized. Unreadable listings must not be returned.
 * Build the authorized query internally; do not accept caller-supplied Elasticsearch queries.
 * Preserve Elasticsearch hit order without exposing scores in skill listings.
 * The index must retain _source and the query must request it for every hit.
 */
export async function searchSkills(
  auth: Authenticator,
  {
    searchTerm,
    filters,
    limit,
  }: {
    searchTerm: string;
    filters?: SkillSearchFilters;
    limit: number;
  }
) {
  const result = await withEs((client) =>
    client.search<SkillSearchDocument>({
      index: SKILL_SEARCH_ALIAS_NAME,
      _source: true,
      query: buildSkillSearchQuery(auth, { searchTerm, filters }),
      size: limit,
      sort: buildSkillDefaultSort(),
    })
  );
  if (result.isErr()) {
    return result;
  }

  const { hits } = result.value.hits;

  return new Ok(hits.map((hit) => toSkillListItem(hit._source!)));
}
