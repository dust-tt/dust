import { ElasticsearchError, withEs } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { SkillSearchDocumentResource } from "@app/lib/resources/skill/skill_search_document_resource";
import type { SkillSearchSort } from "@app/lib/skill_search/query";
import {
  SKILL_SEARCH_KEEP_ALIVE_SECONDS,
  SkillSearchSortSchema,
} from "@app/lib/skill_search/query";
import type {
  SkillSearchPermissionFiltering,
  SkillSearchResult,
} from "@app/types/api/skills";
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
  skill: SkillSearchResult | null;
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
  }: {
    query: estypes.QueryDslQueryContainer;
    pitId: string;
    searchAfter: SkillSearchSort | null;
    limit: number;
    permissionFiltering?: SkillSearchPermissionFiltering;
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
  const sources: SkillSearchDocument[] = [];
  for (const hit of hits) {
    const source = hit._source;
    if (
      source?.workspace_id === workspaceId &&
      isString(source.skill_id) &&
      Array.isArray(source.requested_space_ids) &&
      source.requested_space_ids.every(isString)
    ) {
      sources.push(source);
    }
  }
  const byId = await SkillSearchDocumentResource.authorizeSearchDocuments(
    auth,
    sources,
    permissionFiltering
  );
  const candidates: SkillSearchCandidate[] = [];
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
    const resource =
      hit._source?.workspace_id === workspaceId
        ? byId.get(hit._source.skill_id)
        : undefined;
    candidates.push({
      sort: sort.data,
      skill: resource ? resource.toSearchJSON(auth, sort.data[0]) : null,
    });
  }
  return new Ok({
    candidates,
    pitId: result.value.pit_id ?? pitId,
    exhausted: hits.length < limit,
  });
}
