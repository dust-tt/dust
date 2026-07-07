import type { GovernancePermission } from "@app/types/group_permissions";
import type { LightWorkspaceType } from "@app/types/user";

const TEST_GOVERNANCE_PERMISSIONS: GovernancePermission[] = [
  {
    permissionType: "create",
    resourceType: "agent",
    configuration: { scope: "everyone" },
  },
  {
    permissionType: "publish",
    resourceType: "agent",
    configuration: { scope: "everyone" },
  },
  {
    permissionType: "create",
    resourceType: "skill",
    configuration: { scope: "everyone" },
  },
  {
    permissionType: "publish",
    resourceType: "skill",
    configuration: { scope: "everyone" },
  },
  {
    permissionType: "invite",
    resourceType: "frame",
    configuration: { scope: "disabled" },
  },
];

export function useGovernancePermissions(owner: LightWorkspaceType): {
  governancePermissions: GovernancePermission[];
  isLoading: boolean;
} {
  const governancePermissions = TEST_GOVERNANCE_PERMISSIONS;

  return {
    governancePermissions,
    isLoading: false,
  };
}
