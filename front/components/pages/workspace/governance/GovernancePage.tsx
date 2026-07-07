import { GovernanceSettingSection } from "@app/components/pages/workspace/governance/GovernanceSettingSection";
import { useFeatureFlags, useWorkspace } from "@app/lib/auth/AuthContext";
import { useGovernancePermissions } from "@app/lib/swr/governance";
import { useGroups } from "@app/lib/swr/groups";
import type { GovernancePermission } from "@app/types/group_permissions";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ActionFrame,
  Page,
  PuzzlePiece01,
  Robot,
  Toggle01Left,
} from "@dust-tt/sparkle";
import groupBy from "lodash/groupBy";

function useUpdateGovernancePermission(owner: LightWorkspaceType) {
  return (input: GovernancePermission) => {
    return true;
  };
}

export const GovernancePage = () => {
  const { hasFeature } = useFeatureFlags();
  const hasAdminGovernanceFeature = hasFeature("admin_governance");

  const owner = useWorkspace();
  const { groups, isGroupsLoading } = useGroups({
    owner,
    kinds: ["provisioned"],
  });
  const { governancePermissions, isLoading: isGovernancePermissionsLoading } =
    useGovernancePermissions(owner);
  const onPermissionChange = useUpdateGovernancePermission(owner);

  const isLoading = isGroupsLoading || isGovernancePermissionsLoading;

  const governancePermissionsMap = groupBy(
    governancePermissions,
    "resourceType"
  );

  const sections = [
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
      label: "Frames",
      icon: ActionFrame,
      governancePermissions: governancePermissionsMap.frame ?? [],
    },
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
        description="Control what members can create and publish. Use groups to grant exceptions."
        icon={Toggle01Left}
      />
      <div className="flex w-full flex-col gap-8">
        {sections.map((section) => (
          <GovernanceSettingSection
            key={section.label}
            label={section.label}
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
