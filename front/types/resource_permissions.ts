import type { Authenticator } from "@app/lib/auth";

import type { GrantVerb } from "./group_permissions";
import type { ModelId } from "./shared/model_id";
import type { RoleType } from "./user";

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
 * A resource whose access is governed by grant verbs. `getAllowedVerbs(auth)` returns the complete
 * set of verbs the caller holds on the resource: the union of the two additive sources —
 * - the verbs the caller's workspace role confers (the resource's per-kind role rules, via
 *   `verbsFromRoleGrants`), and
 * - the verbs resolved from the caller's governance grants
 *   (`Authenticator.getGovernanceGrantVerbs`), already caller-scoped so no group-membership step is
 *   needed.
 *
 * `auth` is passed so the set is resolved for the caller. A permission check passes when the verb is
 * in the returned set (see `Authenticator.hasPermission` / `can`); an empty set denies (fail-closed).
 */
export interface WithAccessControl {
  getAllowedVerbs(auth: Authenticator): Set<GrantVerb>;
}

/**
 * The verbs the caller's workspace role confers among `roleGrants`, for a resource in
 * `workspaceModelId`. Resources union this with their governance verbs in `getAllowedVerbs`.
 */
/**
 * @cc [owner:tdraier,label:security] role-verbs-workspace-gated
 * Role verbs MUST be returned ONLY when the caller's own workspace
 * (`auth.getNonNullableWorkspace().id`) equals `workspaceModelId` (the resource's workspace); the
 * function MUST return `[]` otherwise. A workspace role confers no verb on a resource in another
 * workspace, so dropping this gate would let a caller's role (e.g. admin) grant verbs on
 * cross-workspace resources.
 */
export function verbsFromRoleGrants(
  auth: Authenticator,
  roleGrants: RoleGrant[],
  workspaceModelId: ModelId
): GrantVerb[] {
  if (auth.getNonNullableWorkspace().id !== workspaceModelId) {
    return [];
  }
  const role = auth.role();
  return roleGrants
    .filter((grant) => grant.role === role)
    .flatMap((grant) => grant.permissions);
}

export function isWithAccessControl(
  resource: object
): resource is WithAccessControl {
  return (
    typeof (resource as Partial<WithAccessControl>).getAllowedVerbs ===
    "function"
  );
}
