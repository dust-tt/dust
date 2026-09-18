import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { SKILL_SEARCH_ALIAS_NAME, withEs } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { prepareSkillSearchQuery } from "@app/lib/skill_search/query";
import type { Result } from "@app/types/shared/result";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";
import type { estypes } from "@elastic/elasticsearch";

/**
 * @cc [owner:aubin-tchoi,label:security;performance] indexed-skill-search-listings
 * Search only the caller's workspace with all required space and editor permissions.
 * Return indexed documents without database reads. Skill-side permission changes are
 * eventually consistent until reindexing; full-skill access is separately authorized.
 */
export async function searchSkills(
  auth: Authenticator,
  { limit }: { limit: number }
): Promise<
  Result<estypes.SearchResponse<SkillSearchDocument>, ElasticsearchError>
> {
  return withEs((client) =>
    client.search<SkillSearchDocument>({
      index: SKILL_SEARCH_ALIAS_NAME,
      query: prepareSkillSearchQuery(auth),
      size: limit,
    })
  );
}
