import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";

/**
 * The groups a new API key may be scoped to: exactly the groups associated to
 * the workspace's regular restricted spaces. Open spaces (readable by everyone
 * via the global group) and non-regular spaces (system, global, conversations,
 * projects/pods) are not scopable.
 */
export async function listKeyScopableGroups(
  auth: Authenticator
): Promise<GroupResource[]> {
  // `listWorkspaceSpaces` excludes projects/pods by default. The enriched
  // serialization carries the canonical `isRestricted` flag and the space's
  // grant `groupIds`, so we just filter and collect.
  const spaces = await SpaceResource.listWorkspaceSpaces(auth);
  const enrichedSpaces = await SpaceResource.batchToJSONEnriched(auth, spaces);

  const groupIds = new Set<string>();
  for (const space of enrichedSpaces) {
    if (space.kind === "regular" && space.isRestricted) {
      for (const groupId of space.groupIds) {
        groupIds.add(groupId);
      }
    }
  }

  const groupsRes = await GroupResource.fetchByIds(auth, [...groupIds]);
  if (groupsRes.isErr()) {
    throw groupsRes.error;
  }
  return groupsRes.value;
}
