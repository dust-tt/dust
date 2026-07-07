import { GovernanceSettingSection } from "@app/components/pages/workspace/governance/GovernanceSettingSection";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import { useGovernancePermissions } from "@app/lib/swr/governance";
import { useGroups } from "@app/lib/swr/groups";
import type {
  GovernancePermission,
  GroupPermissionResourceType,
} from "@app/types/group_permissions";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ActionFrame,
  Lock01,
  Page,
  PuzzlePiece01,
  Robot,
  Toggle01Left,
} from "@dust-tt/sparkle";
import groupBy from "lodash/groupBy";
import type { ComponentType } from "react";

function useUpdateGovernancePermission(owner: LightWorkspaceType) {
  return (input: GovernancePermission) => {
    return true;
  };
}

export const GovernancePage = () => {
  const { hasFeature } = useFeatureFlags();
  const hasAdminGovernanceFeature = hasFeature("admin_governance");

  const owner = useWorkspace();
  const { isAdmin } = useAuth();
  const { groups, isGroupsLoading } = useGroups({
    owner,
    kinds: ["provisioned"],
  });
  const { governancePermissions, isLoading: isGovernancePermissionsLoading } =
    useGovernancePermissions(owner);
  const onPermissionChange = useUpdateGovernancePermission(owner);

  const isLoading = isGroupsLoading || isGovernancePermissionsLoading;

  const governancePermissionsMap: Partial<
    Record<GroupPermissionResourceType, GovernancePermission[]>
  > = groupBy(governancePermissions, "resourceType");

  const billingPermissions = governancePermissionsMap.billing ?? [];
  const identityPermissions = governancePermissionsMap.identity ?? [];

  const sections: {
    label: string;
    description?: string;
    icon: ComponentType;
    governancePermissions: GovernancePermission[];
  }[] = [
    {
      label: "Agents",
      icon: Robot,
      governancePermissions: governancePermissionsMap.agent ?? [],
    },
    {
      label: "Skills",
      icon: PuzzlePiece01,
      governancePermissions: governancePermissionsMap.skill ?? [],
    },
    {
      label: "Frame sharing",
      description: "Choose how members can share frames outside the workspace.",
      icon: ActionFrame,
      governancePermissions: governancePermissionsMap.frame ?? [],
    },
    ...(isAdmin
      ? [
          {
            label: "Billing and security",
            icon: Lock01,
            governancePermissions: [
              ...billingPermissions,
              ...identityPermissions,
            ],
          },
        ]
      : []),
  ];

  if (!hasAdminGovernanceFeature) {
    return null;
  }

  if (isLoading) {
    return (
      <Page>
        <Page.Header title="Governance" description="Loading..." />
      </Page>
    );
  }

  return (
    <Page>
      <Page.Header
        title="Governance"
        description="Control what members can access, create, publish and share."
        icon={Toggle01Left}
      />
      <div className="flex w-full flex-col gap-8">
        {sections.map((section) => (
          <GovernanceSettingSection
            key={section.label}
            label={section.label}
            description={section.description}
            icon={section.icon}
            governancePermissions={section.governancePermissions}
            groups={groups}
            onPermissionChange={onPermissionChange}
          />
        ))}
      </div>
    </Page>
  );
};
