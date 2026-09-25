import type { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import type { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { isManageableGroupKind } from "@app/types/groups";
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

/**
 * @cc [owner:philipperolet,label:security;backend] group-manager-assignment
 * Only a workspace admin may replace group managers. Every requested manager MUST be an active
 * member of the same workspace. Validation MUST finish before any grant is changed.
 */
export async function replaceGroupManagers(
  auth: Authenticator,
  group: GroupResource,
  managerIds: string[]
): Promise<
  | { kind: "unauthorized" | "invalid_managers" }
  | {
      kind: "ok";
      managers: UserType[];
      addedUsers: UserType[];
      removedUsers: UserType[];
    }
> {
  if (!auth.isAdmin()) {
    return { kind: "unauthorized" };
  }
  if (
    group.workspaceId !== auth.getNonNullableWorkspace().id ||
    !isManageableGroupKind(group.kind)
  ) {
    return { kind: "unauthorized" };
  }

  const uniqueIds = [...new Set(managerIds)];
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

  const { addedUsers, removedUsers } =
    await GroupPermissionResource.replaceUsersForGrant(auth, {
      users: users.map((user) => user.toJSON()),
      ...managerGrant(group),
    });
  return {
    kind: "ok",
    managers: users.map((user) => user.toJSON()),
    addedUsers,
    removedUsers,
  };
}
