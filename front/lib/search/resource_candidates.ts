import { ElasticsearchError, withEs } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { AgentSearchDocumentResource } from "@app/lib/resources/agent/agent_search_document_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSearchDocumentResource } from "@app/lib/resources/skill/skill_search_document_resource";
import type { ResourceSearchSort } from "@app/lib/search/resource_query";
import {
  RESOURCE_SEARCH_KEEP_ALIVE_SECONDS,
  ResourceSearchSortSchema,
} from "@app/lib/search/resource_query";
import type { AgentSearchDocument } from "@app/types/agent_search/agent_search";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type {
  SearchPermissionFiltering,
  SearchResourceType,
} from "@app/types/search";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";
import type { estypes } from "@elastic/elasticsearch";
import assert from "assert";

export type ResourceSearchEntry =
  | { type: "skill"; resource: SkillResource; score: number }
  | { type: "agent"; resource: LightAgentConfigurationType; score: number };

export interface ResourceSearchCandidate {
  // Retain denied hits' positions so an inaccessible page can still advance.
  entry: ResourceSearchEntry | null;
  sort: ResourceSearchSort;
}

function isSkillDocument(
  document: SkillSearchDocument | AgentSearchDocument
): document is SkillSearchDocument {
  return isString(document.skill_id) && !isString(document.agent_id);
}

function isAgentDocument(
  document: SkillSearchDocument | AgentSearchDocument
): document is AgentSearchDocument {
  return isString(document.agent_id) && !isString(document.skill_id);
}

export async function searchResourceCandidates(
  auth: Authenticator,
  {
    query,
    pitId,
    searchAfter,
    limit,
    resourceTypes,
    permissionFiltering = "strict",
  }: {
    query: estypes.QueryDslQueryContainer;
    pitId: string;
    searchAfter: ResourceSearchSort | null;
    limit: number;
    resourceTypes: SearchResourceType[];
    permissionFiltering?: SearchPermissionFiltering;
  }
): Promise<
  Result<
    {
      candidates: ResourceSearchCandidate[];
      pitId: string;
      exhausted: boolean;
    },
    ElasticsearchError
  >
> {
  assert(permissionFiltering !== "redact_unreadable" || auth.isAdmin());
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const result = await withEs((client) =>
    client.search<SkillSearchDocument | AgentSearchDocument>({
      pit: { id: pitId, keep_alive: `${RESOURCE_SEARCH_KEEP_ALIVE_SECONDS}s` },
      // A PIT replaces the index parameter, never workspace isolation.
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
        { resource_id: { order: "asc" } },
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
      new ElasticsearchError("query_error", "Resource search timed out")
    );
  }
  const hits = result.value.hits.hits;
  const skills: SkillSearchDocument[] = [];
  const agents: AgentSearchDocument[] = [];
  for (const hit of hits) {
    const source = hit._source;
    if (
      !source ||
      source.workspace_id !== workspaceId ||
      !Array.isArray(source.requested_space_ids) ||
      !source.requested_space_ids.every(isString)
    ) {
      continue;
    }
    if (isSkillDocument(source) && resourceTypes.includes("skill")) {
      skills.push(source);
    } else if (isAgentDocument(source) && resourceTypes.includes("agent")) {
      agents.push(source);
    }
  }
  const [skillById, agentById] = await Promise.all([
    SkillSearchDocumentResource.authorizeSearchDocuments(
      auth,
      skills,
      permissionFiltering
    ),
    AgentSearchDocumentResource.authorizeSearchDocuments(
      auth,
      agents,
      permissionFiltering
    ),
  ]);
  const candidates: ResourceSearchCandidate[] = [];
  for (const hit of hits) {
    const parsed = ResourceSearchSortSchema.safeParse(hit.sort);
    if (!parsed.success) {
      return new Err(
        new ElasticsearchError(
          "query_error",
          "Missing resource search sort values"
        )
      );
    }
    const sort = parsed.data;
    const source = hit._source;
    let entry: ResourceSearchEntry | null = null;
    if (source?.workspace_id === workspaceId && isSkillDocument(source)) {
      const resource = skillById.get(source.skill_id);
      if (resource) {
        entry = { type: "skill", resource, score: sort[0] };
      }
    } else if (
      source?.workspace_id === workspaceId &&
      isAgentDocument(source)
    ) {
      const resource = agentById.get(source.agent_id);
      if (resource) {
        entry = { type: "agent", resource, score: sort[0] };
      }
    }
    candidates.push({ sort, entry });
  }
  return new Ok({
    candidates,
    pitId: result.value.pit_id ?? pitId,
    exhausted: hits.length < limit,
  });
}
