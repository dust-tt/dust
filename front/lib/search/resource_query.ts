import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  applySearchRanking,
  buildResourceMatchQuery,
} from "@app/lib/search/ranking";
import type { ResourceSearchOptions, SearchFilters } from "@app/types/search";
import type { estypes } from "@elastic/elasticsearch";
import assert from "assert";
import { z } from "zod";

export const MAX_RESOURCE_SEARCH_RESULTS = 150;
export const RESOURCE_SEARCH_KEEP_ALIVE_SECONDS = 300;
export const ResourceSearchSortSchema = z.tuple([
  z.number().finite(),
  z.string(),
  z.string(),
  z.number().int(),
]);
export type ResourceSearchSort = z.infer<typeof ResourceSearchSortSchema>;

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
 * Skills accept individual or group editor grants and current type-wide write grants;
 * group and type-wide skill grants never confer visibility on agents.
 */
function buildEditorFilter(
  auth: Authenticator
): estypes.QueryDslQueryContainer {
  const user = auth.user();
  if (!user) {
    return { match_none: {} };
  }
  const skillFilter = { exists: { field: "skill_id" } };
  const skillEditorFilter =
    auth.getResourceIdsWithVerb("skill", "write").kind === "all"
      ? skillFilter
      : {
          bool: {
            filter: [
              skillFilter,
              {
                terms: {
                  editor_group_ids: [...new Set(auth.groupModelIds())].sort(
                    (a, b) => a - b
                  ),
                },
              },
            ],
          },
        };
  return {
    bool: {
      should: [{ term: { editor_user_ids: user.id } }, skillEditorFilter],
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
  filters: SearchFilters
): estypes.QueryDslQueryContainer[] {
  const selected: estypes.QueryDslQueryContainer[] = [];
  for (const [field, values] of [
    ["requested_space_ids", filters.spaceIds],
    ["tools", filters.toolIds],
    ["availability", filters.availability],
    ["tags", filters.tagIds],
    ["skills", filters.skillIds],
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
 * @cc [owner:aubin-tchoi,label:security] workspace-scoped-resource-search
 * Every query is workspace- and lifecycle-scoped; strict mode requires every space and
 * editor visibility. Only admins may omit visibility gates for metadata redaction.
 * The API-key editor exception applies to skills only, never to agents.
 */
export function prepareResourceSearchQuery(
  auth: Authenticator,
  {
    searchTerm,
    resourceTypes = ["skill", "agent"],
    mode = "autocomplete",
    filters = {},
    permissionFiltering = "strict",
  }: ResourceSearchOptions
): estypes.QueryDslQueryContainer {
  assert(resourceTypes.length > 0);
  assert(
    permissionFiltering !== "redact_unreadable" || auth.isAdmin(),
    "Only admins can search unreadable skills and agents."
  );
  const visibility = buildAvailabilityFilter(auth);
  const availabilityFilter = auth.isKey()
    ? resourceTypes.every((type) => type === "skill")
      ? []
      : [
          {
            bool: {
              should: [
                ...(resourceTypes.includes("skill")
                  ? [{ exists: { field: "skill_id" } }]
                  : []),
                visibility,
              ],
              minimum_should_match: 1,
            },
          },
        ]
    : [visibility];
  return applySearchRanking(
    {
      bool: {
        filter: [
          { term: { workspace_id: auth.getNonNullableWorkspace().sId } },
          { term: { status: "active" } },
          ...(permissionFiltering === "strict"
            ? [...availabilityFilter, buildSpaceAccessFilter(auth)]
            : []),
          ...buildSelectionFilters(auth, filters),
        ],
        must: [buildResourceMatchQuery(searchTerm, mode)],
      },
    },
    mode
  );
}
