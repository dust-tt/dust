import {
  ElasticsearchError,
  SKILL_SEARCH_ALIAS_NAME,
  withEs,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillSearchSort } from "@app/lib/skill_search/query";
import { SkillSearchSortSchema } from "@app/lib/skill_search/query";
import type {
  SkillSearchFilters,
  SkillSearchPermissionFiltering,
} from "@app/types/api/skills";
import type { SkillListItemType } from "@app/types/assistant/skill_configuration";
import { Err, Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";
import assert from "assert";

export type { SkillSearchSort } from "@app/lib/skill_search/query";
export {
  MAX_SKILL_SEARCH_RESULTS,
  prepareSkillSearchQuery,
  SkillSearchSortSchema,
} from "@app/lib/skill_search/query";

export interface SkillSearchCandidate {
  // Rejected hits retain their position so a page of denied hits can advance.
  skill: (SkillListItemType & { score: number }) | null;
  sort: SkillSearchSort;
}

/**
 * @cc [owner:aubin-tchoi,label:security] canonical-skill-search-authorization
 * Results must come from the workspace-scoped resource fetch, match the requested statuses,
 * and, in strict mode, pass current row, space and editor permissions. Only admins may
 * retain unreadable listings through canonical metadata redaction; ES supplies no display data.
 */
export async function searchSkillDocumentCandidates(
  auth: Authenticator,
  {
    query,
    searchAfter,
    limit,
    permissionFiltering = "strict",
    status = ["active"],
  }: {
    query: estypes.QueryDslQueryContainer;
    searchAfter: SkillSearchSort | null;
    limit: number;
    permissionFiltering?: SkillSearchPermissionFiltering;
    status?: SkillSearchFilters["status"];
  }
) {
  assert(permissionFiltering !== "redact_unreadable" || auth.isAdmin());
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const result = await withEs((client) =>
    client.search({
      index: SKILL_SEARCH_ALIAS_NAME,
      _source: false,
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
  const sorts = SkillSearchSortSchema.array().safeParse(
    hits.map((hit) => hit.sort)
  );
  if (!sorts.success) {
    return new Err(
      new ElasticsearchError("query_error", "Missing skill search sort values")
    );
  }
  const skills = await SkillResource.fetchByIds(
    auth,
    sorts.data.map(([, , skillId]) => skillId),
    {
      permissionFiltering,
      withInstructions: false,
      withTools: false,
      withFileAttachments: false,
    }
  );
  const skillById = new Map(skills.map((skill) => [skill.sId, skill]));
  const candidates: SkillSearchCandidate[] = sorts.data.map((sort) => {
    const [score, , skillId] = sort;
    const skill = skillById.get(skillId);
    const visible =
      skill &&
      status.some((value) => value === skill.status) &&
      (permissionFiltering === "redact_unreadable" ||
        skill.availability !== "editors" ||
        skill.canWrite(auth));
    return {
      sort,
      skill: visible ? skill.toSearchJSON(auth, score) : null,
    };
  });
  return new Ok({
    candidates,
    exhausted: hits.length < limit,
  });
}
