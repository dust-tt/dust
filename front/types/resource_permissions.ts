import type { GrantVerb } from "./group_permissions";
import type { ModelId } from "./shared/model_id";
import type { RoleType } from "./user";

/**
 * A group and the verbs it is granted on a resource.
 *
 * @property id - The group's model id
 * @property permissions - Grant verbs the group holds
 */
export type GroupGrant = {
  id: ModelId;
  permissions: GrantVerb[];
};

/**
 * A role and the verbs it is granted on a resource.
 *
 * @property role - The workspace role
 * @property permissions - Grant verbs the role holds
 */
export type RoleGrant = {
  role: RoleType;
  permissions: GrantVerb[];
};

/**
 * The access rules for a resource: the roles and groups that confer verbs, scoped to a workspace.
 *
 * A resource builds its own ACL (see each resource's `acl(auth)`) from role rules and/or the
 * caller's governance grants (`Authenticator.getGroupPermissions`). The Authenticator evaluates it
 * with `hasPermission`: a caller passes if their role grants the verb, or they belong to a listed
 * group that grants it. When the groups come from governance grants, the list is caller-scoped
 * (only the caller's groups) — an ACL is a check artifact, not a complete "who has access" listing.
 *
 * @property roles - Role-based grants: a caller whose workspace role matches gets its verbs
 * @property groups - Group-based grants: a caller in a listed group gets its verbs
 * @property workspaceId - The resource's workspace; checks only apply within the caller's workspace
 */
export type AccessControlList = {
  roles: RoleGrant[];
  groups: GroupGrant[];
  workspaceId: ModelId;
};
