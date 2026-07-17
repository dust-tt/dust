import type { Authenticator } from "@app/lib/auth";
import type { CapabilityState } from "@app/lib/resources/group_permission_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import type { GovernancePermissionsByKey } from "@app/types/api/governance";
import type {
  CapabilitySpec,
  GovernancePermissionConfiguration,
} from "@app/types/group_permissions";
import {
  capabilityKey,
  GOVERNANCE_CAPABILITIES,
} from "@app/types/group_permissions";
import { assertNever } from "@app/types/shared/utils/assert_never";
import assert from "assert";

// Capabilities every business admin (and admin) can manage.
const BUSINESS_ADMIN_CAPABILITIES: CapabilitySpec[] = [
  ...GOVERNANCE_CAPABILITIES.agent,
  ...GOVERNANCE_CAPABILITIES.skill,
  ...GOVERNANCE_CAPABILITIES.frame,
];

// Capabilities every admin can manage.
const ADMIN_CAPABILITIES: CapabilitySpec[] = [
  ...BUSINESS_ADMIN_CAPABILITIES,
  ...GOVERNANCE_CAPABILITIES.billingAndSecurity,
];

function toConfiguration(
  state: CapabilityState
): GovernancePermissionConfiguration {
  switch (state.scope) {
    case "admins_only":
      return { scope: "admins_only" };
    case "everyone":
      return { scope: "everyone" };
    case "groups":
      return { scope: "groups", groupIds: state.groups.map((g) => g.sId) };
    default:
      return assertNever(state);
  }
}

// Governance capabilities shown on the page, keyed by `${grantType}:${resourceType}`
// Business admins receive every domain except billing/identity; admins receive all.
export async function getWorkspaceGovernancePermissions(
  auth: Authenticator
): Promise<GovernancePermissionsByKey> {
  const capabilities = auth.isAdmin()
    ? ADMIN_CAPABILITIES
    : BUSINESS_ADMIN_CAPABILITIES;

  const stateByKey = await GroupPermissionResource.getCapabilitiesState(
    auth,
    capabilities
  );

  const permissionsByKey: GovernancePermissionsByKey = {};
  for (const { grantType, resourceType } of capabilities) {
    const key = capabilityKey({ grantType, resourceType });
    const state = stateByKey.get(key);
    assert(state, `Missing capability state for ${key}.`);

    permissionsByKey[key] = {
      grantType,
      resourceType,
      configuration: toConfiguration(state),
    };
  }

  return permissionsByKey;
}
