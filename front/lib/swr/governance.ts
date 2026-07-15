import type { GovernancePermission } from "@app/types/group_permissions";
import type { LightWorkspaceType } from "@app/types/user";

const TEST_GOVERNANCE_PERMISSIONS: GovernancePermission[] = [
  {
    grantType: "create",
    resourceType: "agent",
    configuration: { scope: "everyone" },
  },
  {
    grantType: "publish",
    resourceType: "agent",
    configuration: { scope: "everyone" },
  },
  {
    grantType: "create",
    resourceType: "skill",
    configuration: { scope: "everyone" },
  },
  {
    grantType: "publish",
    resourceType: "skill",
    configuration: { scope: "everyone" },
  },
  {
    grantType: "invite",
    resourceType: "frame",
    configuration: { scope: "admins_only" },
  },
  {
    grantType: "publish",
    resourceType: "frame",
    configuration: { scope: "admins_only" },
  },
  {
    grantType: "admin",
    resourceType: "billing",
    configuration: { scope: "admins_only" },
  },
  {
    grantType: "admin",
    resourceType: "identity",
    configuration: { scope: "admins_only" },
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
