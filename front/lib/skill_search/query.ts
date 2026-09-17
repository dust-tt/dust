import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { buildSkillMatchQuery } from "@app/lib/skill_search/ranking";
import type {
  SkillSearchFilters,
  SkillSearchOptions,
} from "@app/types/api/skills";
import type { estypes } from "@elastic/elasticsearch";
import { z } from "zod";

export const MAX_SKILL_SEARCH_RESULTS = 150;
export const SkillSearchSortSchema = z.tuple([
  z.number().finite(),
  z.string(),
  z.string(),
]);
export type SkillSearchSort = z.infer<typeof SkillSearchSortSchema>;

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
    ["mcp_server_view_ids", filters.toolIds],
    ["availability", filters.availability],
  ] as const) {
    if (values?.length) {
      selected.push({ terms: { [field]: [...new Set(values)].sort() } });
    }
  }
  if (filters.isDefault !== undefined) {
    const defaultFilter = { term: { availability: "users_and_agents" } };
    selected.push(
      filters.isDefault
        ? defaultFilter
        : { bool: { must_not: [defaultFilter] } }
    );
  }
  if (filters.editedByMe !== undefined) {
    const editorFilter = buildEditorFilter(auth);
    selected.push(
      filters.editedByMe ? editorFilter : { bool: { must_not: [editorFilter] } }
    );
  }
  return selected;
}

/**
 * @cc [owner:aubin-tchoi,label:security] workspace-scoped-skill-search
 * Every query is workspace- and lifecycle-scoped, defaulting to active skills, and requires
 * every requested space and editor visibility.
 */
export function prepareSkillSearchQuery(
  auth: Authenticator,
  searchTerm: string,
  { filters = {} }: Pick<SkillSearchOptions, "filters"> = {}
): estypes.QueryDslQueryContainer {
  const readableSpaceIds = getSkillSearchReadableSpaceIds(auth);
  return {
    bool: {
      filter: [
        { term: { workspace_id: auth.getNonNullableWorkspace().sId } },
        {
          terms: {
            status: [...new Set(filters.status ?? ["active"])].sort(),
          },
        },
        buildAvailabilityFilter(auth),
        buildSpaceAccessFilter(readableSpaceIds),
        ...buildSelectionFilters(auth, filters),
      ],
      must: [buildSkillMatchQuery(searchTerm)],
    },
  };
}
