import type {
  CapabilityKey,
  GovernancePermission,
} from "@app/types/group_permissions";

export type GovernancePermissionsByKey = Partial<
  Record<CapabilityKey, GovernancePermission>
>;

export type GetGovernancePermissionsResponseBody = {
  governancePermissions: GovernancePermissionsByKey;
};
