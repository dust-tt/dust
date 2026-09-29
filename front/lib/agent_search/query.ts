import { GLOBAL_AGENTS_WORKSPACE_ID } from "@app/lib/agent_search/constants";
import { buildAgentNameAutocompleteQuery } from "@app/lib/agent_search/ranking";
import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type {
  AgentSearchFilters,
  AgentSearchPermissionFiltering,
} from "@app/types/agent_search/agent_search";
import type { estypes } from "@elastic/elasticsearch";

export const MAX_AGENT_SEARCH_RESULTS = 100;
// Elasticsearch's default `index.max_result_window`: `offset + limit` cannot go past it.
export const MAX_AGENT_SEARCH_WINDOW = 10_000;
export const MAX_AGENT_SEARCH_FACET_VALUES = 1_000;

// Null represents a type-wide read grant; do not enumerate resources in that case.
function getAgentSearchReadableSpaceIds(auth: Authenticator) {
  const workspaceModelId = auth.getNonNullableWorkspace().id;
  const spaces = auth.getReadableSpaceModelIds();
  return spaces.kind === "all"
    ? null
    : spaces.resourceIds
        .map((id) =>
          SpaceResource.modelIdToSId({ id, workspaceId: workspaceModelId })
        )
        .sort();
}

/**
 * @cc [owner:tdraier,label:security] agent-search-all-required-spaces
 * Every requested space of a custom agent must be readable, mirroring
 * `agent-read-requires-space-read`. Agents without requested spaces MUST match. Space read grants
 * are resolved by Authenticator, not fetched here.
 */
function buildSpaceAccessFilter(
  readableSpaceIds: string[] | null
): estypes.QueryDslQueryContainer {
  if (readableSpaceIds === null) {
    return { match_all: {} };
  }
  return {
    bool: {
      should: [
        // `terms_set` never matches a document without values.
        { bool: { must_not: [{ exists: { field: "requested_space_ids" } }] } },
        {
          terms_set: {
            requested_space_ids: {
              terms: readableSpaceIds,
              minimum_should_match_script: {
                source: "doc['requested_space_ids'].size()",
              },
            },
          },
        },
      ],
      minimum_should_match: 1,
    },
  };
}

/**
 * @cc [owner:tdraier,label:security] agent-search-editor-filter
 * Editor matching requires the current user's sId in the indexed editor IDs. A caller without a
 * user (API keys) matches no editor-only agent.
 */
function buildEditorFilter(
  auth: Authenticator
): estypes.QueryDslQueryContainer {
  const user = auth.user();
  return user ? { term: { editor_ids: user.sId } } : { match_none: {} };
}

/**
 * @cc [owner:tdraier,label:security] agent-search-visibility
 * Mirrors the `read` side of `agent-verbs`: a custom agent matches when its scope is `visible`
 * or the caller is one of its indexed editors. The workspace admin role alone MUST NOT match
 * hidden agents (see `hidden-agent-content`). Only a type-wide agent `read` grant lifts this filter.
 */
function buildVisibilityFilter(
  auth: Authenticator
): estypes.QueryDslQueryContainer {
  if (auth.getResourceIdsWithVerb("agent", "read").kind === "all") {
    return { match_all: {} };
  }
  return {
    bool: {
      should: [{ term: { scope: "visible" } }, buildEditorFilter(auth)],
      minimum_should_match: 1,
    },
  };
}

function buildSelectionFilters(
  auth: Authenticator,
  filters: AgentSearchFilters
): estypes.QueryDslQueryContainer[] {
  const selected: estypes.QueryDslQueryContainer[] = [];
  for (const [field, values] of [
    ["scope", filters.scope],
    ["tag_ids", filters.tagIds],
    ["skill_ids", filters.skillIds],
    ["mcp_server_view_ids", filters.mcpServerViewIds],
    ["editor_ids", filters.editorIds],
    ["model.model_id", filters.modelIds],
    ["requested_space_ids", filters.spaceIds],
  ] as const) {
    if (values?.length) {
      selected.push({ terms: { [field]: values } });
    }
  }
  if (filters.editedByMe) {
    selected.push(buildEditorFilter(auth));
  }
  const { min, max } = filters.activeUsersCount ?? {};
  if (min !== undefined || max !== undefined) {
    selected.push({ range: { active_users_count: { gte: min, lte: max } } });
  }
  return selected;
}

/**
 * @cc [owner:tdraier,label:security] workspace-scoped-agent-search
 * Every query is scoped to the caller's workspace and to the explicitly eligible global agent IDs
 * in the reserved global namespace. It defaults to active agents. In strict mode (the default),
 * custom agents additionally require visibility (see `agent-search-visibility`) and every
 * requested space; unrestricted mode lifts both. Callers must authorize unrestricted mode upstream.
 */
export function buildAgentSearchQuery(
  auth: Authenticator,
  {
    searchTerm,
    permissionFiltering = "strict",
    filters = {},
    globalAgentIds = [],
  }: {
    searchTerm: string;
    permissionFiltering?: AgentSearchPermissionFiltering;
    filters?: AgentSearchFilters;
    globalAgentIds?: string[];
  }
): estypes.QueryDslQueryContainer {
  return {
    bool: {
      filter: [
        { terms: { status: filters.status ?? ["active"] } },
        ...buildSelectionFilters(auth, filters),
      ],
      must: [buildAgentNameAutocompleteQuery(searchTerm)],
      should: [
        {
          bool: {
            filter: [
              { term: { workspace_id: auth.getNonNullableWorkspace().sId } },
              ...(permissionFiltering === "strict"
                ? [
                    buildVisibilityFilter(auth),
                    buildSpaceAccessFilter(
                      getAgentSearchReadableSpaceIds(auth)
                    ),
                  ]
                : []),
            ],
          },
        },
        {
          bool: {
            filter: [
              { term: { workspace_id: GLOBAL_AGENTS_WORKSPACE_ID } },
              { terms: { agent_id: globalAgentIds } },
            ],
          },
        },
      ],
      minimum_should_match: 1,
    },
  };
}
