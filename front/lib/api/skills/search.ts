import { SKILL_SEARCH_ALIAS_NAME, withEs } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import {
  buildSkillSearchQuery,
  MAX_SKILL_SEARCH_RESULTS,
} from "@app/lib/skill_search/query";
import { buildSkillDefaultSort } from "@app/lib/skill_search/ranking";
import { toSkillListItem } from "@app/lib/skill_search/serialization";
import type {
  SkillSearchFilters,
  SkillSearchPermissionFiltering,
  SkillSearchSort,
} from "@app/types/api/skills";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";
import type { estypes } from "@elastic/elasticsearch";
import { z } from "zod";

const SkillSearchSortSchema = z.array(
  z.union([z.string(), z.number(), z.boolean(), z.null()])
);

/**
 * @cc [owner:aubin-tchoi,label:security;performance] indexed-skill-search-listings
 * Return only workspace-scoped or eligible code-defined indexed metadata using hydrated grants.
 * Result projection must not read the database; code-defined eligibility is resolved before the query.
 * Permission-bearing document changes are eventually consistent; full-skill
 * access remains separately authorized. Callers must authorize admin-only redaction upstream.
 * Build the authorized query internally; do not accept caller-supplied Elasticsearch queries.
 * Preserve Elasticsearch hit order without exposing scores or readability flags in skill listings.
 * Request _source and omit hits without source documents.
 * Return at most limit skills; nextCursor must point to the last consumed hit, not the lookahead.
 */

/**
 * @cc [owner:aubin-tchoi,label:security;product] unified-search-pagination
 * Custom and code-defined skills share one ES-ranked stream; cursors advance only past
 * consumed hits.
 * Cursors encode the ES sort tuple as an opaque string and convey no authorization.
 * Every page applies hydrated grants to indexed requirements.
 * Pagination reads the live index; concurrent index changes may cause skips or duplicates.
 */
export async function searchSkills(
  auth: Authenticator,
  {
    limit = MAX_SKILL_SEARCH_RESULTS,
    cursor,
    sortBy,
    ...options
  }: {
    searchTerm: string;
    filters?: SkillSearchFilters;
    permissionFiltering?: SkillSearchPermissionFiltering;
    limit?: number;
    cursor?: string | null;
    sortBy?: SkillSearchSort;
  }
) {
  let searchAfter: estypes.SortResults | undefined;
  if (cursor !== undefined && cursor !== null) {
    const parsed = safeParseJSON(
      Buffer.from(cursor, "base64url").toString("utf8")
    );
    const sort = SkillSearchSortSchema.safeParse(
      parsed.isOk() ? parsed.value : undefined
    );
    if (!sort.success) {
      return new Err("invalid_cursor" as const);
    }
    searchAfter = sort.data;
  }

  const codeDefinedSkillIds = await SkillResource.listAvailableCodeDefinedIds(
    auth,
    { mcpServerViewIds: options.filters?.mcpServerViewIds }
  );
  const query = buildSkillSearchQuery(auth, {
    ...options,
    codeDefinedSkillIds,
  });

  const result = await withEs((client) =>
    client.search<SkillSearchDocument>({
      index: SKILL_SEARCH_ALIAS_NAME,
      _source: true,
      query,
      size: limit + 1,
      sort: buildSkillDefaultSort(sortBy),
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
    skills: removeNulls(pageHits.map((hit) => hit._source)).map((document) =>
      toSkillListItem(document)
    ),
    hasMore: hits.length > limit,
    nextCursor: nextCursor
      ? Buffer.from(JSON.stringify(nextCursor)).toString("base64url")
      : null,
  });
}
