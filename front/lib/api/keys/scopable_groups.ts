import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";

/**
 * The groups a new API key may be scoped to: the groups associated to the
 * workspace's restricted spaces — both regular (spaces) and project (pods) —
 * plus the workspace global group.
 *
 * A manageable group (regular_manual / provisioned) can be granted access to
 * several restricted spaces at once, so scoping a key to it indirectly scopes
 * the key to every restricted space that carries the group. Open spaces are
 * readable through the global group and are not meaningful to scope to.
 *
 * The global group is included so that existing keys — which the backend always
 * scopes to the global group in addition to any explicit selection — can be
 * rendered by ids; the picker filters it out client-side.
 */
export async function listKeyScopableGroups(
  auth: Authenticator
): Promise<GroupResource[]> {
  const spaces = await SpaceResource.listWorkspaceSpaces(auth, {
    includeProjectSpaces: true,
    includeOpen: false,
  });
  // `includeOpen: false` leaves the non-scopable unique kinds (system, global)
  // in the result; narrow to the regular/project spaces we actually care about.
  const restrictedSpaces = spaces.filter(
    (space) => space.isRegular() || space.isProject()
  );

  const referencesBySpaceModelId =
    await SpaceResource.listGrantReferencesBySpaceModelId(restrictedSpaces);

  const groupIds = new Set<string>();
  for (const references of referencesBySpaceModelId.values()) {
    for (const reference of references) {
      groupIds.add(reference.groupSId);
    }
  }

  const globalGroupRes = await GroupResource.fetchWorkspaceGlobalGroup(auth);
  if (globalGroupRes.isOk()) {
    groupIds.add(globalGroupRes.value.sId);
  }

  const groupsRes = await GroupResource.fetchByIds(auth, [...groupIds]);
  if (groupsRes.isErr()) {
    throw groupsRes.error;
  }
  return groupsRes.value;
}
