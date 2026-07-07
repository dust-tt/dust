import type { GovernancePermission } from "@app/types/group_permissions";
import type { LightWorkspaceType } from "@app/types/user";

export function useGovernancePermissions(owner: LightWorkspaceType): {
  governancePermissions: GovernancePermission[];
  isLoading: boolean;
} {
  const governancePermissions: GovernancePermission[] = [
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

  return {
    governancePermissions,
    isLoading: false,
  };
}
