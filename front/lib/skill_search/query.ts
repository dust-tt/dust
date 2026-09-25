import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { CODE_DEFINED_SKILLS_WORKSPACE_ID } from "@app/lib/skill_search/constants";
import { buildSkillNameAutocompleteQuery } from "@app/lib/skill_search/ranking";
import type {
  SkillSearchFilters,
  SkillSearchPermissionFiltering,
} from "@app/types/api/skills";
import type { estypes } from "@elastic/elasticsearch";

export const MAX_SKILL_SEARCH_RESULTS = 100;
// Elasticsearch's default `index.max_result_window`: `offset + limit` cannot go past it.
export const MAX_SKILL_SEARCH_WINDOW = 10_000;
export const MAX_SKILL_SEARCH_FACET_VALUES = 1_000;

// Null represents a type-wide read grant; do not enumerate resources in that case.
export function getSkillSearchReadableSpaceIds(auth: Authenticator) {
  const workspaceId = auth.getNonNullableWorkspace().id;
  const spaces = auth.getReadableSpaceModelIds();
  return spaces.kind === "all"
    ? null
    : spaces.resourceIds
        .map((id) => SpaceResource.modelIdToSId({ id, workspaceId }))
        .sort();
}

/**
 * @cc [owner:aubin-tchoi,label:security] all-required-spaces
 * Every requested space, including projects, must be readable. Custom skills require at least
 * one space. Space read grants are resolved by Authenticator, not fetched here.
 */
function buildSpaceAccessFilter(
  readableSpaceIds: string[] | null
): estypes.QueryDslQueryContainer {
  if (readableSpaceIds === null) {
    return { match_all: {} };
  }
  return {
    terms_set: {
      requested_space_ids: {
        terms: readableSpaceIds,
        minimum_should_match_script: {
          source: "doc['requested_space_ids'].size()",
        },
      },
    },
  };
}

/**
 * @cc [owner:aubin-tchoi,label:security] resource-editor-filter
 * Editor-only skills require the current user's sId in the indexed editor IDs.
 */
function buildEditorFilter(
  auth: Authenticator
): estypes.QueryDslQueryContainer {
  return { term: { editor_ids: auth.getNonNullableUser().sId } };
}

function buildAvailabilityFilter(
  auth: Authenticator
): estypes.QueryDslQueryContainer {
  return {
    bool: {
      should: [
        { terms: { availability: ["workspace_users", "users_and_agents"] } },
        buildEditorFilter(auth),
      ],
      minimum_should_match: 1,
    },
  };
}

function buildSelectionFilters(
  auth: Authenticator,
  filters: SkillSearchFilters
): estypes.QueryDslQueryContainer[] {
  const selected: estypes.QueryDslQueryContainer[] = [];
  for (const [field, values] of [
    ["mcp_server_view_ids", filters.mcpServerViewIds],
    ["availability", filters.availability],
    ["editor_ids", filters.editorIds],
    ["child_skill_ids", filters.childSkillIds],
    ["requested_space_ids", filters.spaceIds],
  ] as const) {
    if (values?.length) {
      selected.push({ terms: { [field]: values } });
    }
  }
  if (filters.editedByMe) {
    selected.push(buildEditorFilter(auth));
  }
  if (filters.codeDefinedOnly) {
    selected.push({ term: { workspace_id: CODE_DEFINED_SKILLS_WORKSPACE_ID } });
  }
  const { min, max } = filters.activeUsersCount ?? {};
  if (min !== undefined || max !== undefined) {
    selected.push({ range: { active_users_count: { gte: min, lte: max } } });
  }
  return selected;
}

/**
 * @cc [owner:aubin-tchoi,label:security] workspace-scoped-skill-search
 * Every query is scoped to the caller's workspace and explicitly eligible code-defined IDs
 * in the reserved global workspace. It defaults to active skills. Strict mode requires every
 * requested space and editor visibility. Callers must authorize admin-only metadata redaction upstream.
 */
export function buildSkillSearchQuery(
  auth: Authenticator,
  {
    searchTerm,
    permissionFiltering = "strict",
    filters = {},
    codeDefinedSkillIds = [],
  }: {
    searchTerm: string;
    filters?: SkillSearchFilters;
    permissionFiltering?: SkillSearchPermissionFiltering;
    codeDefinedSkillIds?: string[];
  }
): estypes.QueryDslQueryContainer {
  return {
    bool: {
      filter: [
        { terms: { status: filters.status ?? ["active"] } },
        ...buildSelectionFilters(auth, filters),
      ],
      must: [buildSkillNameAutocompleteQuery(searchTerm)],
      should: [
        {
          bool: {
            filter: [
              { term: { workspace_id: auth.getNonNullableWorkspace().sId } },
              ...(permissionFiltering === "strict"
                ? [
                    buildAvailabilityFilter(auth),
                    buildSpaceAccessFilter(
                      getSkillSearchReadableSpaceIds(auth)
                    ),
                  ]
                : []),
            ],
          },
        },
        {
          bool: {
            filter: [
              { term: { workspace_id: CODE_DEFINED_SKILLS_WORKSPACE_ID } },
              { terms: { skill_id: codeDefinedSkillIds } },
            ],
          },
        },
      ],
      minimum_should_match: 1,
    },
  };
}
