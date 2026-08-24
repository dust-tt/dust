import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { CapabilityState } from "@app/lib/resources/group_permission_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { GovernancePermissionsByKey } from "@app/types/api/governance";
import type {
  CapabilitySpec,
  GovernancePermission,
  GovernancePermissionConfiguration,
} from "@app/types/group_permissions";
import {
  capabilityKey,
  GOVERNANCE_CAPABILITIES,
} from "@app/types/group_permissions";
import { isManageableGroupKind } from "@app/types/groups";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import assert from "assert";

// Capabilities every manager (and admin) can manage.
const MANAGER_CAPABILITIES: CapabilitySpec[] = [
  ...GOVERNANCE_CAPABILITIES.agent,
  ...GOVERNANCE_CAPABILITIES.skill,
  ...GOVERNANCE_CAPABILITIES.frame,
  ...GOVERNANCE_CAPABILITIES.trigger,
];

// Capabilities every admin can manage.
const ADMIN_CAPABILITIES: CapabilitySpec[] = [
  ...MANAGER_CAPABILITIES,
  ...GOVERNANCE_CAPABILITIES.billingAndSecurity,
];

// The capabilities the caller's role is allowed to see and manage. Admins get everything; business
// admins get every domain except billing/identity; no other role manages any governance capability.
function capabilitiesForRole(auth: Authenticator): CapabilitySpec[] {
  const role = auth.role();
  switch (role) {
    case "admin":
      return ADMIN_CAPABILITIES;
    case "manager":
      return MANAGER_CAPABILITIES;
    case "builder":
    case "user":
    case "none":
      return [];
    default:
      return assertNever(role);
  }
}

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
// Managers receive every domain except billing/identity; admins receive all.
export async function getWorkspaceGovernancePermissions(
  auth: Authenticator
): Promise<GovernancePermissionsByKey> {
  const capabilities = capabilitiesForRole(auth);

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

// Write side of the Governance page: apply one capability's target configuration. The three scopes
// are mutually exclusive, so each maps to a single resource transition that clears the others.
export async function setWorkspaceGovernancePermission(
  auth: Authenticator,
  { grantType, resourceType, configuration }: GovernancePermission
): Promise<
  Result<
    GovernancePermission,
    DustError<"group_not_found" | "invalid_id" | "unauthorized">
  >
> {
  const capability: CapabilitySpec = { grantType, resourceType };

  const canManage = capabilitiesForRole(auth).some(
    (c) => c.grantType === grantType && c.resourceType === resourceType
  );
  if (!canManage) {
    return new Err(
      new DustError(
        "unauthorized",
        "You cannot manage this governance permission."
      )
    );
  }

  switch (configuration.scope) {
    case "admins_only":
      await GroupPermissionResource.disable(auth, capability);
      break;

    case "everyone":
      await GroupPermissionResource.setForEverybody(auth, capability);
      break;

    case "groups": {
      // "Groups" with no groups selected grants the capability to nobody specific, which is
      // equivalent to admins_only.
      if (configuration.groupIds.length === 0) {
        await GroupPermissionResource.disable(auth, capability);
        break;
      }
      const groupsRes = await GroupResource.fetchByIds(
        auth,
        configuration.groupIds
      );
      if (groupsRes.isErr()) {
        return groupsRes;
      }
      // Only user-managed groups can be granted a governance capability; system/global and other
      // internal kinds are never assignable here.
      if (
        !groupsRes.value.every((group) => isManageableGroupKind(group.kind))
      ) {
        return new Err(
          new DustError(
            "invalid_id",
            "The groups configuration references groups that cannot be managed."
          )
        );
      }
      await GroupPermissionResource.setGroups(
        auth,
        capability,
        groupsRes.value
      );
      break;
    }

    default:
      assertNever(configuration);
  }

  const key = capabilityKey(capability);
  const stateByKey = await GroupPermissionResource.getCapabilitiesState(auth, [
    capability,
  ]);
  const state = stateByKey.get(key);
  assert(state, `Missing capability state for ${key}.`);

  const updatedConfiguration = toConfiguration(state);

  void emitAuditLogEvent({
    auth,
    action: "workspace.governance_permission_updated",
    targets: [buildAuditLogTarget("workspace", auth.getNonNullableWorkspace())],
    context: getAuditLogContext(auth),
    metadata: {
      grant_type: grantType,
      resource_type: resourceType,
      scope: updatedConfiguration.scope,
      group_ids:
        updatedConfiguration.scope === "groups"
          ? updatedConfiguration.groupIds.join(",")
          : "",
    },
  });

  return new Ok({
    grantType,
    resourceType,
    configuration: updatedConfiguration,
  });
}
