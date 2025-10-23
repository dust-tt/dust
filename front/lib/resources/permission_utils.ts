import assert from "assert";

import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { ModelId, ResourcePermission } from "@app/types";

/**
 * Creates ResourcePermission objects from space ids by resolving them to their corresponding group
 * requirements.
 *
 * This utility function:
 * 1. Maps each space to its group requirements using space.requestedPermissions()
 * 2. Resolves the requested space ids to their corresponding group ids
 * 3. Returns ResourcePermission objects compatible with Authenticator.canRead(), canWrite(), etc.
 *
 * @param requestedSpaceIds - Array of space ids that need permission resolution
 * @param allFetchedSpaces - All SpaceResource objects that were fetched (must include all requestedSpaceIds)
 * @returns Array of ResourcePermission objects for use with Authenticator permission methods
 */
export function createResourcePermissionsFromSpaces(
  auth: Authenticator,
  allFetchedSpaces: SpaceResource[],
  { requestedSpaceIds }: { requestedSpaceIds: ModelId[] }
): ResourcePermission[] {
  const workspaceId = auth.getNonNullableWorkspace().id;

  // Build space id to groups mapping.
  // TODO: Map must be done before calling this function, as it's called in a loop.
  const spaceIdToGroupsMap = new Map<ModelId, string[][]>();
  for (const space of allFetchedSpaces) {
    const permissions = space.requestedPermissions();
    const groupIds = permissions.map((permission) =>
      permission.groups.map((group) =>
        GroupResource.modelIdToSId({
          id: group.id,
          workspaceId,
        })
      )
    );
    spaceIdToGroupsMap.set(space.id, groupIds);
  }

  // Resolve requested space ids to group ids.
  const resolvedGroupIds: string[][] = [];
  for (const spaceId of requestedSpaceIds) {
    const groupIds = spaceIdToGroupsMap.get(spaceId);
    assert(groupIds, `No group IDs found for space ID ${spaceId}`);

    resolvedGroupIds.push(...groupIds);
  }

  return Authenticator.createResourcePermissionsFromGroupIds(resolvedGroupIds);
}
