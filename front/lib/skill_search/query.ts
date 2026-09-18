import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { buildSkillNameAutocompleteQuery } from "@app/lib/skill_search/ranking";
import type { SkillSearchFilters } from "@app/types/api/skills";
import type { estypes } from "@elastic/elasticsearch";

export const MAX_SKILL_SEARCH_RESULTS = 100;

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
 * Every requested space, including projects, must be readable. An empty list imposes no space
 * restriction. Space read grants are resolved by Authenticator, not fetched here.
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
  ] as const) {
    if (values?.length) {
      selected.push({ terms: { [field]: [...new Set(values)].sort() } });
    }
  }
  if (filters.editedByMe) {
    selected.push(buildEditorFilter(auth));
  }
  return selected;
}

/**
 * @cc [owner:aubin-tchoi,label:security] workspace-scoped-skill-search
 * Every query is workspace- and lifecycle-scoped, defaulting to active skills, and requires
 * every requested space and editor visibility. Selection filters never replace permissions.
 */
export function buildSkillSearchQuery(
  auth: Authenticator,
  {
    searchTerm,
    filters = {},
  }: {
    searchTerm: string;
    filters?: SkillSearchFilters;
  }
): estypes.QueryDslQueryContainer {
  return {
    bool: {
      filter: [
        { term: { workspace_id: auth.getNonNullableWorkspace().sId } },
        {
          terms: { status: [...new Set(filters.status ?? ["active"])].sort() },
        },
        buildAvailabilityFilter(auth),
        buildSpaceAccessFilter(getSkillSearchReadableSpaceIds(auth)),
        ...buildSelectionFilters(auth, filters),
      ],
      must: [buildSkillNameAutocompleteQuery(searchTerm)],
    },
  };
}
