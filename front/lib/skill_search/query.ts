import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { estypes } from "@elastic/elasticsearch";

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

/**
 * @cc [owner:aubin-tchoi,label:security] workspace-scoped-skill-search
 * Every query is scoped to the caller's workspace and requires every requested space
 * and editor visibility. Permissions come from hydrated grants, without database reads.
 */
export function buildSkillSearchQuery(
  auth: Authenticator
): estypes.QueryDslQueryContainer {
  return {
    bool: {
      filter: [
        { term: { workspace_id: auth.getNonNullableWorkspace().sId } },
        buildAvailabilityFilter(auth),
        buildSpaceAccessFilter(getSkillSearchReadableSpaceIds(auth)),
      ],
    },
  };
}
