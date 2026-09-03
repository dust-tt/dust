import { emitGroupMemberAuditLogs } from "@app/lib/api/groups/audit";
import { getUserForWorkspace } from "@app/lib/api/user";
import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MANAGEABLE_GROUP_KINDS } from "@app/types/groups";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

type GroupMembershipErrorType =
  | "group_not_found"
  | "group_requirements_not_met"
  | "invalid_group_id"
  | "system_or_global_group"
  | "unauthorized"
  | "user_already_member"
  | "user_not_found"
  | "user_not_member";

export class GroupMembershipError extends Error {
  constructor(
    readonly type: GroupMembershipErrorType,
    message: string
  ) {
    super(message);
  }
}

/**
 * Groups (provisioned and manually-managed) a workspace member belongs to.
 */
export async function getMemberGroups(
  auth: Authenticator,
  { userId }: { userId: string }
): Promise<Result<GroupResource[], GroupMembershipError>> {
  const user = await getUserForWorkspace(auth, { userId });
  if (!user) {
    return new Err(
      new GroupMembershipError(
        "user_not_found",
        "The user requested was not found."
      )
    );
  }

  const groups = await GroupResource.listUserGroupsInWorkspace({
    auth,
    user,
    groupKinds: [...MANAGEABLE_GROUP_KINDS],
  });

  return new Ok(groups);
}

/**
 * Adds or removes a single workspace member from a manually-managed group, and audit-logs the
 * change. Returns the updated group.
 */
export async function updateMemberGroupMembership(
  auth: Authenticator,
  {
    groupId,
    userId,
    direction,
  }: { groupId: string; userId: string; direction: "add" | "remove" }
): Promise<Result<GroupResource, GroupMembershipError>> {
  const user = await getUserForWorkspace(auth, { userId });
  if (!user) {
    return new Err(
      new GroupMembershipError(
        "user_not_found",
        "The user requested was not found."
      )
    );
  }

  const groupRes = await GroupResource.fetchById(auth, groupId);
  if (groupRes.isErr()) {
    switch (groupRes.error.code) {
      case "invalid_id":
        return new Err(
          new GroupMembershipError("invalid_group_id", groupRes.error.message)
        );
      case "unauthorized":
        return new Err(
          new GroupMembershipError("unauthorized", groupRes.error.message)
        );
      case "group_not_found":
        return new Err(
          new GroupMembershipError("group_not_found", groupRes.error.message)
        );
      default:
        assertNever(groupRes.error.code);
    }
  }

  const group = groupRes.value;

  const updateRes = await group.updateRegularManualGroupMembers(auth, {
    addUserIds: direction === "add" ? [user.sId] : [],
    removeUserIds: direction === "remove" ? [user.sId] : [],
  });
  if (updateRes.isErr()) {
    return new Err(
      new GroupMembershipError(updateRes.error.code, updateRes.error.message)
    );
  }

  emitGroupMemberAuditLogs(auth, group, updateRes.value);

  return new Ok(group);
}
