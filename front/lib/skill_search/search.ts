import { ElasticsearchError, withEs } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillSearchSort } from "@app/lib/skill_search/query";
import {
  SKILL_SEARCH_KEEP_ALIVE_SECONDS,
  SkillSearchSortSchema,
} from "@app/lib/skill_search/query";
import type {
  SkillSearchFilters,
  SkillSearchPermissionFiltering,
} from "@app/types/api/skills";
import type { SkillListItemType } from "@app/types/assistant/skill_configuration";
import { Err, Ok } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";
import type { estypes } from "@elastic/elasticsearch";
import assert from "assert";

export type { SkillSearchSort } from "@app/lib/skill_search/query";
export {
  MAX_SKILL_SEARCH_RESULTS,
  prepareSkillSearchQuery,
  SKILL_SEARCH_KEEP_ALIVE_SECONDS,
  SkillSearchSortSchema,
} from "@app/lib/skill_search/query";

export interface SkillSearchCandidate {
  // Rejected hits retain their position so a page of denied hits can advance.
  skill: (SkillListItemType & { score: number }) | null;
  sort: SkillSearchSort;
}

export async function searchSkillDocumentCandidates(
  auth: Authenticator,
  {
    query,
    pitId,
    searchAfter,
    limit,
    permissionFiltering = "strict",
    status,
  }: {
    query: estypes.QueryDslQueryContainer;
    pitId: string;
    searchAfter: SkillSearchSort | null;
    limit: number;
    permissionFiltering?: SkillSearchPermissionFiltering;
    status?: SkillSearchFilters["status"];
  }
) {
  assert(permissionFiltering !== "redact_unreadable" || auth.isAdmin());
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const result = await withEs((client) =>
    client.search<SkillSearchDocument>({
      pit: { id: pitId, keep_alive: `${SKILL_SEARCH_KEEP_ALIVE_SECONDS}s` },
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
      track_total_hits: false,
      allow_partial_search_results: false,
    })
  );
  if (result.isErr()) {
    return result;
  }
  if (result.value.timed_out) {
    return new Err(
      new ElasticsearchError("query_error", "Skill search timed out")
    );
  }
  const hits = result.value.hits.hits;
  const sources: { document: SkillSearchDocument; score: number }[] = [];
  const sortedHits: {
    source: SkillSearchDocument | undefined;
    sort: SkillSearchSort;
  }[] = [];
  for (const hit of hits) {
    const sort = SkillSearchSortSchema.safeParse(hit.sort);
    if (!sort.success) {
      return new Err(
        new ElasticsearchError(
          "query_error",
          "Missing skill search sort values"
        )
      );
    }
    const source = hit._source;
    sortedHits.push({ source, sort: sort.data });
    if (
      source?.workspace_id === workspaceId &&
      isString(source.skill_id) &&
      Array.isArray(source.requested_space_ids) &&
      source.requested_space_ids.every(isString)
    ) {
      sources.push({ document: source, score: sort.data[0] });
    }
  }
  const byId = await SkillResource.authorizeSearchDocuments(
    auth,
    sources,
    permissionFiltering,
    status
  );
  const candidates: SkillSearchCandidate[] = [];
  for (const { source, sort } of sortedHits) {
    candidates.push({
      sort,
      skill:
        source?.workspace_id === workspaceId
          ? (byId.get(source.skill_id) ?? null)
          : null,
    });
  }
  return new Ok({
    candidates,
    pitId: result.value.pit_id ?? pitId,
    exhausted: hits.length < limit,
  });
}
