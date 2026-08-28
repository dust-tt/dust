import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";

/**
 * The groups a new API key may be scoped to: the groups the caller is a member
 * of, minus any group tied to a project (pod) space. Keys scope to regular
 * spaces only, so pod member/editor groups are excluded even though the caller
 * belongs to them.
 */
export async function listKeyScopableGroups(
  auth: Authenticator
): Promise<GroupResource[]> {
  const memberGroups = await GroupResource.listMemberGroups(auth);

  // Groups attached to the caller's pod spaces (member and editor groups) are
  // not scopable. One batched grant lookup gives every such group id.
  const podSpaces = await SpaceResource.listWorkspacePodsAsMember(auth);
  const podGroupRefsBySpace =
    await SpaceResource.listGrantReferencesBySpaceModelId(podSpaces);
  const podGroupModelIds = new Set(
    [...podGroupRefsBySpace.values()]
      .flat()
      .map((reference) => reference.groupId)
  );

  return memberGroups.filter((group) => !podGroupModelIds.has(group.id));
}
