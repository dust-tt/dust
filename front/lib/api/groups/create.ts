import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { Err, Ok } from "@app/types/shared/result";

/**
 * @cc [owner:philipperolet,label:security;backend] create-group-managers
 * Only workspace admins and managers may appoint managers at creation. Managers MUST be active
 * workspace members, and group creation and manager assignments MUST commit together.
 */
export async function createGroup(
  auth: Authenticator,
  {
    name,
    memberIds,
    managerIds = [],
  }: { name: string; memberIds: string[]; managerIds?: string[] }
) {
  if (managerIds.length > 0 && !auth.isManager()) {
    return new Err(
      new DustError(
        "unauthorized",
        "Only workspace admins and managers can appoint group managers."
      )
    );
  }
  const uniqueManagerIds = [...new Set(managerIds)];
  const managers = await UserResource.fetchByIds(uniqueManagerIds);
  const { memberships } = await MembershipResource.getActiveMemberships({
    users: managers,
    workspace: auth.getNonNullableWorkspace(),
  });
  if (
    managers.length !== uniqueManagerIds.length ||
    memberships.length !== managers.length
  ) {
    return new Err(
      new DustError(
        "user_not_found",
        "All group managers must be active workspace members."
      )
    );
  }

  return withTransaction(async (transaction) => {
    const result = await GroupResource.makeNewRegularManual(
      auth,
      { name, memberIds },
      { transaction }
    );
    if (result.isErr()) {
      return result;
    }
    const addedManagers = managers.map((manager) => manager.toJSON());
    const grant = await GroupPermissionResource.grantToUsers(auth, {
      users: addedManagers,
      grantType: "group_manager",
      resourceType: "group",
      resourceId: result.value.group.id,
      transaction,
    });
    if (grant.isErr()) {
      throw grant.error;
    }
    return new Ok({ ...result.value, addedManagers });
  });
}
