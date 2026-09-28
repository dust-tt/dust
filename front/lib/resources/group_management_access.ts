import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { MANAGEABLE_GROUP_KINDS } from "@app/types/groups";
import type { ModelId } from "@app/types/shared/model_id";

export type GroupManagementVerb = "write" | "read_usage" | "set_usage_limits";
export type GroupMemberVerb = Exclude<GroupManagementVerb, "write">;

function canUseGroupVerb(
  auth: Authenticator,
  group: GroupResource,
  verb: GroupManagementVerb
): boolean {
  return (
    auth.can(verb, group) &&
    (verb !== "write" || group.canManageMembersGivenGrantedRole(auth))
  );
}

/**
 * @cc [owner:philipperolet,label:security;backend] managed-group-scope
 * Results MUST be in the caller's workspace, be manual or provisioned groups, and grant the
 * requested verb. `write` MUST exclude provisioned groups and admin-granting groups for
 * non-admins. A type-wide group grant MUST be checked against each eligible group.
 * Use when a page or API needs the actual groups to show or edit: for example, Usage group
 * allowances or the People membership controls. This loads all eligible groups for workspace
 * managers/admins. For member queries, use `getMemberScopeWithGroupVerb`; for one group, check
 * `auth.can` directly instead of enumerating groups.
 */
export async function listGroupsWithVerb(
  auth: Authenticator,
  verb: GroupManagementVerb
): Promise<GroupResource[]> {
  const grantScope = auth.getResourceIdsWithVerb("group", verb);
  const groupKinds = [...MANAGEABLE_GROUP_KINDS];
  const groups =
    auth.isManager() || auth.isAdmin() || grantScope.kind === "all"
      ? await GroupResource.listAllWorkspaceGroups(auth, { groupKinds })
      : await GroupResource.dangerouslyFetchByModelIds(
          auth,
          grantScope.resourceIds,
          { groupKinds }
        );

  return groups.filter((group) => canUseGroupVerb(auth, group, verb));
}

export type GroupMemberScope =
  | { kind: "all" }
  | { kind: "ids"; memberModelIds: ModelId[] };

/**
 * @cc [owner:philipperolet,label:security;backend] managed-member-scope
 * Workspace managers/admins cover all active workspace members. Everyone else MUST receive only
 * active workspace members with a current active membership in a group granting the requested
 * verb, once each even when memberships overlap. No matching group MUST return an empty ID list.
 * Use to restrict list queries before search, counts, and pagination: `read_usage` for member
 * usage and `set_usage_limits` for pending limit requests. Workspace managers/admins get `all`
 * without loading any groups.
 */
export async function getMemberScopeWithGroupVerb(
  auth: Authenticator,
  verb: GroupMemberVerb
): Promise<GroupMemberScope> {
  if (auth.isManager() || auth.isAdmin()) {
    return { kind: "all" };
  }

  const groups = await listGroupsWithVerb(auth, verb);
  const membersByGroup = await GroupResource.getActiveMembershipsForGroups(
    auth,
    groups
  );
  const memberModelIds = [...new Set(Object.values(membersByGroup).flat())];
  if (memberModelIds.length === 0) {
    return { kind: "ids", memberModelIds: [] };
  }

  const users = await UserResource.fetchByModelIds(memberModelIds);
  const { memberships } = await MembershipResource.getActiveMemberships({
    users,
    workspace: auth.getNonNullableWorkspace(),
  });
  return {
    kind: "ids",
    memberModelIds: [...new Set(memberships.map((m) => m.userId))],
  };
}

/**
 * @cc [owner:philipperolet,label:security;backend] current-member-authority
 * A member MUST have an active membership in the caller's workspace. Non-workspace managers
 * MUST also have a current active membership in a group on which the caller holds `verb`.
 * Use at action time for one member: `set_usage_limits` when editing a personal limit or
 * resolving a request, and `read_usage` for an individual usage lookup. This returns only a
 * boolean; an audit event that names the authorizing group needs that group resolved too.
 */
export async function hasGroupVerbForMember(
  auth: Authenticator,
  member: UserResource,
  verb: GroupMemberVerb
): Promise<boolean> {
  const workspace = auth.getNonNullableWorkspace();
  const { memberships } = await MembershipResource.getActiveMemberships({
    users: [member],
    workspace,
  });
  if (memberships.length === 0) {
    return false;
  }
  if (auth.isManager() || auth.isAdmin()) {
    return true;
  }

  const groups = await GroupResource.listUserGroupsInWorkspace({
    auth,
    user: member,
    groupKinds: [...MANAGEABLE_GROUP_KINDS],
  });
  return groups.some((group) => canUseGroupVerb(auth, group, verb));
}
