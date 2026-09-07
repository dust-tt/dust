import { ElasticsearchError, withEs } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { SkillSearchDocumentResource } from "@app/lib/resources/skill/skill_search_document_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { getResourceNameAndIdFromSId } from "@app/lib/resources/string_ids";
import { buildSkillMatchQuery } from "@app/lib/skill_search/ranking";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";
import type { estypes } from "@elastic/elasticsearch";
import { z } from "zod";

export const MAX_SKILL_SEARCH_RESULTS = 150;
export const SKILL_SEARCH_KEEP_ALIVE_SECONDS = 300;
export const SkillSearchSortSchema = z.tuple([
  z.number().finite(),
  z.string(),
  z.string(),
  z.number().int(),
]);
export type SkillSearchSort = z.infer<typeof SkillSearchSortSchema>;

export interface SkillSearchCandidate {
  // Rejected hits retain their position so a page of denied hits can advance.
  document: SkillSearchDocument | null;
  sort: SkillSearchSort;
}

function buildNonPodAccessFilter(
  readableNonPodSpaceIds: string[]
): estypes.QueryDslQueryContainer {
  if (readableNonPodSpaceIds.length === 0) {
    return { term: { non_pod_space_count: 0 } };
  }

  return {
    bool: {
      should: [
        { term: { non_pod_space_count: 0 } },
        {
          terms_set: {
            non_pod_space_ids: {
              terms: readableNonPodSpaceIds,
              minimum_should_match_field: "non_pod_space_count",
            },
          },
        },
      ],
      minimum_should_match: 1,
    },
  };
}

function buildAvailabilityFilter(
  editorUserId: ModelId | null
): estypes.QueryDslQueryContainer {
  const should: estypes.QueryDslQueryContainer[] = [
    { terms: { availability: ["workspace_users", "users_and_agents"] } },
  ];
  if (editorUserId !== null) {
    should.push({
      bool: {
        filter: [
          { term: { availability: "editors" } },
          { term: { editor_user_ids: editorUserId } },
        ],
      },
    });
  }

  return {
    bool: {
      should,
      minimum_should_match: 1,
    },
  };
}

function canReadEditorsOnlyCandidate(
  auth: Authenticator,
  candidate: SkillSearchDocument
): boolean {
  if (candidate.availability !== "editors" || auth.isKey()) {
    return true;
  }

  const user = auth.user();
  const parsedSkillId = getResourceNameAndIdFromSId(candidate.skill_id);

  return (
    user !== null &&
    Array.isArray(candidate.editor_user_ids) &&
    candidate.editor_user_ids.includes(user.id) &&
    parsedSkillId?.resourceName === "skill" &&
    parsedSkillId.workspaceModelId === auth.getNonNullableWorkspace().id &&
    auth
      .getGrantedVerbs("skill", parsedSkillId.resourceModelId)
      .includes("write")
  );
}

function buildSkillSearchQuery({
  workspaceId,
  searchTerm,
  readableNonPodSpaceIds,
  editorUserId,
  canReadAllEditorsOnly,
}: {
  workspaceId: string;
  searchTerm: string;
  readableNonPodSpaceIds: string[];
  editorUserId: ModelId | null;
  canReadAllEditorsOnly: boolean;
}): estypes.QueryDslQueryContainer {
  return {
    bool: {
      filter: [
        { term: { workspace_id: workspaceId } },
        { term: { status: "active" } },
        ...(canReadAllEditorsOnly
          ? []
          : [buildAvailabilityFilter(editorUserId)]),
        buildNonPodAccessFilter(readableNonPodSpaceIds),
      ],
      must: [buildSkillMatchQuery(searchTerm)],
    },
  };
}

const SKILL_SEARCH_SORT: estypes.Sort = [
  { _score: { order: "desc" } },
  { "name.keyword": { order: "asc" } },
  { skill_id: { order: "asc" } },
];

function getSkillSearchHitSources(
  hits: estypes.SearchHit<SkillSearchDocument>[]
): SkillSearchDocument[] {
  return removeNulls(
    hits.map((hit) => {
      const source = hit._source;
      if (
        !source ||
        typeof source.skill_id !== "string" ||
        (source.pod_space_id !== null &&
          typeof source.pod_space_id !== "string")
      ) {
        return null;
      }

      return source;
    })
  );
}

// Prepare once per API request, not once per candidate batch.
export async function prepareSkillSearchQuery(
  auth: Authenticator,
  searchTerm: string
): Promise<estypes.QueryDslQueryContainer> {
  const workspaceSpaces = await SpaceResource.listWorkspaceSpaces(auth, {
    includeConversationsSpace: true,
  });
  const readableNonPodSpaceIds = [
    ...new Set(
      workspaceSpaces
        .filter((space) => auth.can("read", space))
        .map((s) => s.sId)
    ),
  ];
  return buildSkillSearchQuery({
    workspaceId: auth.getNonNullableWorkspace().sId,
    searchTerm,
    readableNonPodSpaceIds: readableNonPodSpaceIds.sort(),
    editorUserId: auth.user()?.id ?? null,
    canReadAllEditorsOnly: auth.isKey(),
  });
}

async function filterSkillSearchCandidates(
  auth: Authenticator,
  candidates: SkillSearchDocument[]
): Promise<SkillSearchDocument[]> {
  if (candidates.length === 0) {
    return [];
  }
  const candidatePodIds = [
    ...new Set(
      removeNulls(candidates.map((candidate) => candidate.pod_space_id))
    ),
  ];
  const candidatePods = await SpaceResource.fetchByIds(auth, candidatePodIds);
  const readableCandidatePodIds = new Set(
    candidatePods
      .filter((space) => space.isProject() && auth.can("read", space))
      .map((space) => space.sId)
  );
  const accessFilteredCandidates = candidates
    .filter(
      (candidate) =>
        candidate.pod_space_id === null ||
        readableCandidatePodIds.has(candidate.pod_space_id)
    )
    .filter((candidate) => canReadEditorsOnlyCandidate(auth, candidate));
  const visibleCandidates =
    await SkillSearchDocumentResource.filterSearchDocumentsByCurrentState(
      auth,
      accessFilteredCandidates
    );

  return visibleCandidates;
}

export async function searchSkillDocumentCandidates(
  auth: Authenticator,
  {
    query,
    pitId,
    searchAfter,
    limit,
  }: {
    query: estypes.QueryDslQueryContainer;
    pitId: string;
    searchAfter: SkillSearchSort | null;
    limit: number;
  }
): Promise<
  Result<
    {
      candidates: SkillSearchCandidate[];
      pitId: string;
      exhausted: boolean;
    },
    ElasticsearchError
  >
> {
  const result = await withEs((client) =>
    client.search<SkillSearchDocument>({
      pit: { id: pitId, keep_alive: `${SKILL_SEARCH_KEEP_ALIVE_SECONDS}s` },
      // A PIT replaces the index parameter, never the workspace/ACL filters.
      query: {
        bool: {
          filter: [
            { term: { workspace_id: auth.getNonNullableWorkspace().sId } },
          ],
          must: [query],
        },
      },
      size: limit,
      sort: SKILL_SEARCH_SORT,
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
  const visible = await filterSkillSearchCandidates(
    auth,
    getSkillSearchHitSources(hits)
  );
  const visibleById = new Map(
    visible.map((document) => [document.skill_id, document])
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
    candidates.push({
      sort: sort.data,
      document: hit._source
        ? (visibleById.get(hit._source.skill_id) ?? null)
        : null,
    });
  }
  return new Ok({
    candidates,
    pitId: result.value.pit_id ?? pitId,
    exhausted: hits.length < limit,
  });
}
