import type { Authenticator } from "@app/lib/auth";

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
 * The access rules for a resource: the additive grant sources that confer verbs, scoped to a
 * workspace. A caller passes an ACL when ANY source grants the verb; a resource passes when the
 * caller satisfies EVERY ACL it declares (see `Authenticator.hasPermission`). Every source is
 * optional and an absent source contributes nothing, so an ACL with no matching source denies
 * (fail-closed) — a missing field is intent, not a bug.
 *
 * The three sources:
 * - `roles`: the caller passes if their workspace role grants the verb (only within the ACL's
 *   workspace).
 * - `grantedVerbs`: the caller's own verbs on the resource, already resolved from their governance
 *   grants (`Authenticator.getGrantedVerbs`). Caller-scoped and pre-filtered, so the checker uses it
 *   directly with no group-membership step. This is the shape governance-sourced ACLs use.
 * - `groups`: legacy group→verb listing. The checker filters it by the caller's group membership at
 *   check time, so it also handles ACLs that enumerate every group (e.g. the cross-space
 *   conversation checks). An ACL is a check artifact, not a complete "who has access" listing.
 *
 * @property roles - Role-based grants: a caller whose workspace role matches gets its verbs
 * @property groups - Legacy group-based grants, filtered by the caller's membership at check time
 * @property grantedVerbs - The caller's pre-resolved governance verbs on the resource
 * @property workspaceId - The resource's workspace; checks only apply within the caller's workspace
 */
export type AccessControlList = {
  roles?: RoleGrant[];
  groups?: GroupGrant[];
  grantedVerbs?: GrantVerb[];
  workspaceId: ModelId;
};

/**
 * A resource whose access is governed by one or more access-control lists. The caller passes when
 * they satisfy every ACL returned by `getAccessControlLists(auth)` (see
 * `Authenticator.hasPermission`). `auth` is passed so a resource can build its ACL from the caller's
 * governance grants (`auth.getGroupPermissions`) — e.g. the per-workspace flip.
 */
export interface WithAccessControl {
  getAccessControlLists(auth: Authenticator): AccessControlList[];
}
