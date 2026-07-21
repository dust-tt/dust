import type {
  CapabilityKey,
  GovernancePermission,
  WorkspacePermissions,
} from "@app/types/group_permissions";

export type GovernancePermissionsByKey = Partial<
  Record<CapabilityKey, GovernancePermission>
>;

export type GetPermissionsResponseBody = {
  workspacePermissions: WorkspacePermissions;
};

export type GetGovernancePermissionsResponseBody = {
  governancePermissions: GovernancePermissionsByKey;
};

export type PatchGovernancePermissionResponseBody = {
  governancePermission: GovernancePermission;
};
