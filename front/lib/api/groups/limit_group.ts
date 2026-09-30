import { areGroupLimitsEnabled } from "@app/lib/api/groups/group_limit_eligibility";
import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { ModelId } from "@app/types/shared/model_id";

/**
 * @cc [owner:rfrenoy,label:product;backend] limit-group-resolution
 * A member's limit group is, among their active memberships in cap-eligible groups that have a group
 * limit, the one with the lowest `groupLimitPriority`. Recording, enforcement and UI data MUST resolve
 * it through this function, which returns nothing when group limits are not enabled.
 */
export async function resolveLimitGroupsForUsers(
  auth: Authenticator,
  { userModelIds }: { userModelIds: ModelId[] }
): Promise<Map<ModelId, GroupResource>> {
  if (!(await areGroupLimitsEnabled(auth))) {
    return new Map();
  }
  return GroupResource.listLimitGroupByUserModelIdInWorkspace({
    workspace: auth.getNonNullableWorkspace(),
    userModelIds,
  });
}

export async function resolveLimitGroupForUser(
  auth: Authenticator,
  { user }: { user: UserResource }
): Promise<GroupResource | null> {
  const limitGroups = await resolveLimitGroupsForUsers(auth, {
    userModelIds: [user.id],
  });
  return limitGroups.get(user.id) ?? null;
}
