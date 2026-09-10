import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  applySearchRanking,
  buildSkillMatchQuery,
} from "@app/lib/skill_search/ranking";
import type {
  SkillSearchFilters,
  SkillSearchOptions,
  SkillSearchPermissionFiltering,
} from "@app/types/api/skills";
import type { estypes } from "@elastic/elasticsearch";
import assert from "assert";
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

/**
 * @cc [owner:aubin-tchoi,label:security] all-required-spaces
 * Every requested space, including projects, must be readable; an empty requirement
 * matches every caller. Space read grants are resolved by Authenticator, not fetched here.
 */
function buildSpaceAccessFilter(
  auth: Authenticator
): estypes.QueryDslQueryContainer {
  const readable = auth.getResourceIdsWithVerb("space", "read");
  if (readable.kind === "all") {
    return { match_all: {} };
  }
  const noRequiredSpaces = {
    bool: { must_not: [{ exists: { field: "requested_space_ids" } }] },
  };
  if (readable.resourceIds.length === 0) {
    return noRequiredSpaces;
  }
  const workspace = auth.getNonNullableWorkspace();
  return {
    bool: {
      should: [
        noRequiredSpaces,
        {
          terms_set: {
            requested_space_ids: {
              terms: readable.resourceIds
                .map((id) =>
                  SpaceResource.modelIdToSId({ id, workspaceId: workspace.id })
                )
                .sort(),
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
 * Skills accept individual or group editor grants and current type-wide write grants.
 */
function buildEditorFilter(
  auth: Authenticator
): estypes.QueryDslQueryContainer {
  const user = auth.user();
  if (!user) {
    return { match_none: {} };
  }
  if (auth.getResourceIdsWithVerb("skill", "write").kind === "all") {
    return { match_all: {} };
  }
  return {
    bool: {
      should: [
        { term: { editors: user.id } },
        { terms: { editor_group_ids: [...new Set(auth.groupModelIds())] } },
      ],
      minimum_should_match: 1,
    },
  };
}

function buildAvailabilityFilter(
  auth: Authenticator
): estypes.QueryDslQueryContainer {
  const should: estypes.QueryDslQueryContainer[] = [
    { terms: { availability: ["workspace_users", "users_and_agents"] } },
  ];
  if (auth.user() !== null) {
    should.push({
      bool: {
        filter: [
          { term: { availability: "editors" } },
          buildEditorFilter(auth),
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

function buildSelectionFilters(
  auth: Authenticator,
  filters: SkillSearchFilters
): estypes.QueryDslQueryContainer[] {
  const selected: estypes.QueryDslQueryContainer[] = [];
  for (const [field, values] of [
    ["requested_space_ids", filters.spaceIds],
    ["tools", filters.toolIds],
    ["availability", filters.availability],
  ] as const) {
    if (values?.length) {
      selected.push({ terms: { [field]: [...new Set(values)].sort() } });
    }
  }
  if (filters.isDefault !== undefined) {
    selected.push({ term: { is_default: filters.isDefault } });
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
 * Every query is workspace- and lifecycle-scoped. Strict mode requires every requested
 * space and editor visibility; only admins may omit those gates for metadata redaction.
 */
export function prepareSkillSearchQuery(
  auth: Authenticator,
  searchTerm: string,
  permissionFiltering: SkillSearchPermissionFiltering = "strict",
  {
    mode = "autocomplete",
    filters = {},
  }: Pick<SkillSearchOptions, "mode" | "filters"> = {}
): estypes.QueryDslQueryContainer {
  assert(
    permissionFiltering !== "redact_unreadable" || auth.isAdmin(),
    "Only admins can search unreadable skills."
  );
  return applySearchRanking(
    {
      bool: {
        filter: [
          { term: { workspace_id: auth.getNonNullableWorkspace().sId } },
          { term: { status: "active" } },
          ...(permissionFiltering === "strict"
            ? [
                ...(auth.isKey() ? [] : [buildAvailabilityFilter(auth)]),
                buildSpaceAccessFilter(auth),
              ]
            : []),
          ...buildSelectionFilters(auth, filters),
        ],
        must: [buildSkillMatchQuery(searchTerm, mode)],
      },
    },
    mode
  );
}
