import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { SKILL_SEARCH_ALIAS_NAME, withEs } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { SkillSearchDocumentResource } from "@app/lib/resources/skill/skill_search_document_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";
import type { estypes } from "@elastic/elasticsearch";
import assert from "assert";

export const MAX_SKILL_SEARCH_RESULTS = 150;
const MAX_SKILL_SEARCH_CANDIDATES = 200;
const MIN_SKILL_SEARCH_CANDIDATES = 50;

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

function escapeWildcardCharacter(character: string): string {
  return character === "\\" || character === "*" || character === "?"
    ? `\\${character}`
    : character;
}

function buildSubsequencePattern(searchTerm: string): string {
  return `*${Array.from(searchTerm, escapeWildcardCharacter).join("*")}*`;
}

function buildSkillSearchQuery({
  workspaceId,
  searchTerm,
  readableNonPodSpaceIds,
}: {
  workspaceId: string;
  searchTerm: string;
  readableNonPodSpaceIds: string[];
}): estypes.QueryDslQueryContainer {
  const trimmedSearchTerm = searchTerm.trim();

  return {
    bool: {
      filter: [
        { term: { workspace_id: workspaceId } },
        { term: { status: "active" } },
        buildNonPodAccessFilter(readableNonPodSpaceIds),
      ],
      ...(trimmedSearchTerm
        ? {
            should: [
              {
                multi_match: {
                  query: trimmedSearchTerm,
                  fields: ["name^4", "user_facing_description^2"],
                  type: "bool_prefix",
                },
              },
              {
                wildcard: {
                  "name.subsequence": {
                    value: buildSubsequencePattern(trimmedSearchTerm),
                    case_insensitive: true,
                    boost: 4,
                  },
                },
              },
              {
                wildcard: {
                  "user_facing_description.subsequence": {
                    value: buildSubsequencePattern(trimmedSearchTerm),
                    case_insensitive: true,
                    boost: 2,
                  },
                },
              },
            ],
            minimum_should_match: 1,
          }
        : {}),
    },
  };
}

function buildSkillSearchSort(hasSearchTerm: boolean): estypes.Sort {
  return hasSearchTerm
    ? [
        { _score: { order: "desc" } },
        { "name.keyword": { order: "asc" } },
        { skill_id: { order: "asc" } },
      ]
    : [{ "name.keyword": { order: "asc" } }, { skill_id: { order: "asc" } }];
}

function getSkillSearchHitSources(
  hits: estypes.SearchHit<SkillSearchDocument>[]
): SkillSearchDocument[] {
  return hits.flatMap((hit) => (hit._source ? [hit._source] : []));
}

/**
 * Searches a bounded custom-skill candidate window.
 *
 * Non-pod spaces are filtered directly in Elasticsearch. Projects/pods are
 * authorized from only the IDs present in the candidate window, so a user's
 * potentially unbounded pod memberships are never sent to Elasticsearch.
 */
export async function searchSkillDocuments(
  auth: Authenticator,
  {
    searchTerm,
    limit,
  }: {
    searchTerm: string;
    limit: number;
  }
): Promise<Result<SkillSearchDocument[], ElasticsearchError>> {
  assert(
    Number.isInteger(limit) && limit > 0 && limit <= MAX_SKILL_SEARCH_RESULTS,
    `limit must be between 1 and ${MAX_SKILL_SEARCH_RESULTS}`
  );

  const workspace = auth.getNonNullableWorkspace();
  const workspaceSpaces = await SpaceResource.listWorkspaceSpaces(auth, {
    includeConversationsSpace: true,
  });
  const readableNonPodSpaceIds = [
    ...new Set(
      workspaceSpaces.filter((space) => space.canRead(auth)).map((s) => s.sId)
    ),
  ];
  const candidateLimit = Math.min(
    MAX_SKILL_SEARCH_CANDIDATES,
    Math.max(MIN_SKILL_SEARCH_CANDIDATES, limit * 3)
  );

  const searchResult = await withEs((client) =>
    client.search<SkillSearchDocument>({
      index: SKILL_SEARCH_ALIAS_NAME,
      query: buildSkillSearchQuery({
        workspaceId: workspace.sId,
        searchTerm,
        readableNonPodSpaceIds,
      }),
      size: candidateLimit,
      sort: buildSkillSearchSort(searchTerm.trim().length > 0),
    })
  );
  if (searchResult.isErr()) {
    return new Err(searchResult.error);
  }

  const candidates =
    await SkillSearchDocumentResource.filterSearchDocumentsByCurrentState(
      auth,
      getSkillSearchHitSources(searchResult.value.hits.hits)
    );
  const candidatePodIds = [
    ...new Set(
      candidates.flatMap((candidate) =>
        candidate.pod_space_id ? [candidate.pod_space_id] : []
      )
    ),
  ];
  const candidatePods = await SpaceResource.fetchByIds(auth, candidatePodIds);
  const readableCandidatePodIds = new Set(
    candidatePods
      .filter((space) => space.isProject() && space.canRead(auth))
      .map((space) => space.sId)
  );
  const editorGroupIds = new Set(auth.groupIds());

  return new Ok(
    candidates
      .filter(
        (candidate) =>
          candidate.pod_space_id === null ||
          readableCandidatePodIds.has(candidate.pod_space_id)
      )
      .filter(
        (candidate) =>
          candidate.availability !== "editors" ||
          auth.isKey() ||
          editorGroupIds.has(candidate.editor_group_id)
      )
      .slice(0, limit)
  );
}
