import { areGroupLimitsEnabled } from "@app/lib/api/groups/group_limit_eligibility";
import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { UserResource } from "@app/lib/resources/user_resource";

/**
 * @cc [owner:rfrenoy,label:product;backend] limit-group-resolution
 * A member's limit group is, among their active memberships in cap-eligible groups that have a group
 * limit, the one with the lowest `groupLimitPriority`. Enforcement, UI data and the first recording of
 * a message MUST resolve it through this function (later recordings reuse the group stored on the
 * message, see `limit-group-captured-at-recording`). Returns nothing when group limits are not
 * enabled.
 *
 * Returns each resolved member's limit group keyed by the member's sId; members without one, or whose
 * limit group the caller cannot `read`, are absent.
 */
export async function resolveLimitGroupsForUsers(
  auth: Authenticator,
  { users }: { users: UserResource[] }
): Promise<Map<string, GroupResource>> {
  if (!(await areGroupLimitsEnabled(auth))) {
    return new Map();
  }

  const limitGroupByUserModelId =
    await GroupResource.listLimitGroupByUserModelIdInWorkspace(auth, {
      userModelIds: users.map((user) => user.id),
    });

  const limitGroupByUserId = new Map<string, GroupResource>();
  for (const user of users) {
    const limitGroup = limitGroupByUserModelId.get(user.id);
    if (limitGroup) {
      limitGroupByUserId.set(user.sId, limitGroup);
    }
  }
  return limitGroupByUserId;
}

export async function resolveLimitGroupForUser(
  auth: Authenticator,
  { user }: { user: UserResource }
): Promise<GroupResource | null> {
  const limitGroups = await resolveLimitGroupsForUsers(auth, {
    users: [user],
  });
  return limitGroups.get(user.sId) ?? null;
}
