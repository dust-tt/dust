import type { Authenticator } from "@app/lib/auth";

import type { GrantVerb } from "./group_permissions";
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
 * - the verbs the caller's workspace role confers (the resource's per-kind role rules, applied only
 *   within the resource's own workspace), and
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
