import type { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { grantKey } from "@app/types/group_permissions";
import { isManageableGroupKind } from "@app/types/groups";
import { removeNulls } from "@app/types/shared/utils/general";
import type { UserType } from "@app/types/user";

const managerGrant = (group: GroupResource) => ({
  grantType: "group_manager" as const,
  resourceType: "group" as const,
  resourceId: group.id,
});

export async function getGroupManagers(
  auth: Authenticator,
  group: GroupResource
): Promise<UserType[]> {
  const holder = await GroupPermissionResource.findRegularAutoGroupForGrant(
    auth,
    managerGrant(group)
  );
  return holder
    ? (await holder.getActiveMembers(auth)).map((user) => user.toJSON())
    : [];
}

export async function getGroupManagersForGroups(
  auth: Authenticator,
  groups: GroupResource[]
): Promise<Map<string, UserType[]>> {
  const grants = groups.map(managerGrant);
  const holders = await GroupPermissionResource.findRegularAutoGroupsForGrants(
    auth,
    { grants }
  );
  const memberships = await GroupResource.getActiveMembershipsForGroups(auth, [
    ...holders.values(),
  ]);
  const userIds = [...new Set(Object.values(memberships).flat())];
  const users = await UserResource.fetchByModelIds(userIds);
  const usersById = new Map(users.map((user) => [user.id, user.toJSON()]));

  return new Map(
    groups.map((group) => {
      const holder = holders.get(grantKey(managerGrant(group)));
      return [
        group.sId,
        removeNulls(
          (holder ? (memberships[holder.id] ?? []) : []).map((id) =>
            usersById.get(id)
          )
        ),
      ];
    })
  );
}

/**
 * @cc [owner:philipperolet,label:security;backend] group-manager-assignment
 * Only a workspace admin or manager may update group managers. Every added manager MUST be
 * an active member of the same workspace. Validation MUST finish before any grant is changed.
 * Unmentioned active workspace managers MUST be preserved and removal
 * MUST take precedence if a manager appears in both lists.
 */
export async function updateGroupManagers(
  auth: Authenticator,
  group: GroupResource,
  userIdsToAdd: string[],
  userIdsToRemove: string[]
): Promise<
  | { kind: "unauthorized" | "invalid_managers" }
  | {
      kind: "ok";
      managers: UserType[];
      addedUsers: UserType[];
      removedUsers: UserType[];
    }
> {
  if (!auth.isManager()) {
    return { kind: "unauthorized" };
  }
  if (
    group.workspaceId !== auth.getNonNullableWorkspace().id ||
    !isManageableGroupKind(group.kind)
  ) {
    return { kind: "unauthorized" };
  }

  const uniqueIds = [...new Set(userIdsToAdd)];
  const users = await UserResource.fetchByIds(uniqueIds);
  if (users.length !== uniqueIds.length) {
    return { kind: "invalid_managers" };
  }
  const { memberships } = await MembershipResource.getActiveMemberships({
    users,
    workspace: auth.getNonNullableWorkspace(),
  });
  if (memberships.length !== users.length) {
    return { kind: "invalid_managers" };
  }

  const changes = await GroupPermissionResource.updateUsersForGrant(auth, {
    usersToAdd: users.map((user) => user.toJSON()),
    ...managerGrant(group),
    userIdsToRemove,
  });
  return {
    kind: "ok",
    managers: await getGroupManagers(auth, group),
    ...changes,
  };
}
