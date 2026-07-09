import { GovernanceSettingSection } from "@app/components/pages/workspace/governance/GovernanceSettingSection";
import { AuditLogsToggle } from "@app/components/workspace/settings/AuditLogsToggle";
import { InteractiveContentSharing } from "@app/components/workspace/settings/InteractiveContentSharingToggle";
import { useFrameSharingToggle } from "@app/hooks/useFrameSharingToggle";
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
  PermissionType,
} from "@app/types/group_permissions";
import type {
  LightWorkspaceType,
  WorkspaceSharingPolicy,
} from "@app/types/user";
import {
  ActionFrame,
  Icon,
  Lock01,
  Page,
  PuzzlePiece01,
  Robot,
  ShapesPlus,
  Toggle01Left,
} from "@dust-tt/sparkle";
import groupBy from "lodash/groupBy";
import type { ComponentType } from "react";

function useUpdateGovernancePermission(owner: LightWorkspaceType) {
  return (input: GovernancePermission) => {
    return true;
  };
}

// Frame governance permissions are only relevant when the workspace sharing policy actually
// enables the underlying capability: email invites require external email sharing, and public
// links require unrestricted sharing.
function isFrameCapabilityEnabled(
  permissionType: PermissionType,
  sharingPolicy: WorkspaceSharingPolicy
): boolean {
  switch (permissionType) {
    case "invite":
      return (
        sharingPolicy === "workspace_and_emails" ||
        sharingPolicy === "all_scopes"
      );
    case "publish":
      return sharingPolicy === "all_scopes";
    default:
      return true;
  }
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

  const { sharingPolicy, doUpdateSharingPolicy, isChanging } =
    useFrameSharingToggle({ owner });

  const isLoading = isGroupsLoading || isGovernancePermissionsLoading;

  const governancePermissionsMap: Partial<
    Record<GroupPermissionResourceType, GovernancePermission[]>
  > = groupBy(governancePermissions, "resourceType");

  const billingPermissions = governancePermissionsMap.billing ?? [];
  const identityPermissions = governancePermissionsMap.identity ?? [];

  const framePermissions = (governancePermissionsMap.frame ?? []).filter(
    (permission) =>
      isFrameCapabilityEnabled(permission.permissionType, sharingPolicy)
  );

  const sections: {
    label: string;
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
    ...(framePermissions.length > 0
      ? [
          {
            label: "Frame sharing",
            icon: ActionFrame,
            governancePermissions: framePermissions,
          },
        ]
      : []),
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
        description="Manage what members can do in your workspace."
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
        {isAdmin && (
          <>
            <div className="flex items-center gap-2">
              <Icon visual={ShapesPlus} className="text-muted-foreground" />
              <Page.H variant="h5">Capabilities</Page.H>
            </div>
            <div className="w-full rounded-xl border border-border">
              <InteractiveContentSharing
                sharingPolicy={sharingPolicy}
                doUpdateSharingPolicy={doUpdateSharingPolicy}
                isChanging={isChanging}
              />
              <AuditLogsToggle owner={owner} />
            </div>
          </>
        )}
      </div>
    </Page>
  );
};
