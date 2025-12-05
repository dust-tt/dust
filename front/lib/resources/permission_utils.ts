import assert from "assert";

import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { ModelId, ResourcePermission } from "@app/types";

/**
 * Creates a space id to group ids mapping for efficient permission resolution.
 * This should be called once and reused for multiple permission checks.
 *
 * @param auth - Authenticator instance
 * @param allFetchedSpaces - All SpaceResource objects that were fetched
 * @returns Map from space id to group ids arrays for permission resolution
 */
export function createSpaceIdToGroupsMap(
  auth: Authenticator,
  allFetchedSpaces: SpaceResource[]
): Map<ModelId, string[]> {
  const workspaceId = auth.getNonNullableWorkspace().id;
  const spaceIdToGroupsMap = new Map<ModelId, string[]>();

  for (const space of allFetchedSpaces) {
    // Use `requestedPermissions` to get up-to-date permission groups (this includes provisioned groups).
    // TODO: Refactor to avoid calling `requestedPermissions` but still get the right groups.
    const permissions = space.requestedPermissions();
    const groupIds = permissions.flatMap((permission) =>
      permission.groups.map((group) =>
        GroupResource.modelIdToSId({
          id: group.id,
          workspaceId,
        })
      )
    );
    spaceIdToGroupsMap.set(space.id, groupIds);
  }

  return spaceIdToGroupsMap;
}

/**
 * Creates ResourcePermission objects from space ids using a pre-built space-to-groups mapping.
 * This is the optimized version that avoids rebuilding the map on each call.
 *
 * @param spaceIdToGroupsMap - Pre-built mapping from space ids to group IDs
 * @param requestedSpaceIds - Array of space ids that need permission resolution
 * @returns Array of ResourcePermission objects for use with Authenticator permission methods
 */
export function createResourcePermissionsFromSpacesWithMap(
  spaceIdToGroupsMap: Map<ModelId, string[]>,
  requestedSpaceIds: ModelId[]
): ResourcePermission[] {
  const resolvedGroupIds: string[][] = [];

  for (const spaceId of requestedSpaceIds) {
    const groupIds = spaceIdToGroupsMap.get(spaceId);

    // This should never happen since conversations are pre-filtered to only include valid spaces.
    assert(groupIds, `No group IDs found for space ID ${spaceId}`);

    resolvedGroupIds.push(groupIds);
  }

  return Authenticator.createResourcePermissionsFromGroupIds(resolvedGroupIds);
}
