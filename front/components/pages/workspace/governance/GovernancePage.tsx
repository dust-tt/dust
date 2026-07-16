import { GovernanceSettingRow } from "@app/components/pages/workspace/governance/GovernanceSettingRow";
import { GovernanceSettingSection } from "@app/components/pages/workspace/governance/GovernanceSettingSection";
import { ExtensionMcpToolsSection } from "@app/components/workspace/ExtensionMcpToolsSection";
import { LinkedSectionNotice } from "@app/components/workspace/LinkedSectionNotice";
import { AuditLogsToggle } from "@app/components/workspace/settings/AuditLogsToggle";
import { DustMcpServerSettingsItem } from "@app/components/workspace/settings/DustMcpServerSettingsItem";
import { EmailAgentsToggle } from "@app/components/workspace/settings/EmailAgentsToggle";
import { InteractiveContentSharing } from "@app/components/workspace/settings/InteractiveContentSharingToggle";
import { OpenPodPolicy } from "@app/components/workspace/settings/OpenProjectsPolicy";
import { PodKnowledgePolicy } from "@app/components/workspace/settings/PodKnowledgePolicy";
import { PrivateConversationUrlsToggle } from "@app/components/workspace/settings/PrivateConversationUrlsToggle";
import { SlackPersonalFooterRemovalToggle } from "@app/components/workspace/settings/SlackPersonalFooterRemovalToggle";
import { VoiceTranscriptionToggle } from "@app/components/workspace/settings/VoiceTranscriptionToggle";
import { WorkspaceAnalyticsToggle } from "@app/components/workspace/settings/WorkspaceAnalyticsToggle";
import { WorkspaceNameEditor } from "@app/components/workspace/settings/WorkspaceNameEditor";
import { useFrameSharingToggle } from "@app/hooks/useFrameSharingToggle";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { useGovernancePermissions } from "@app/lib/swr/governance";
import { useGroups } from "@app/lib/swr/groups";
import type {
  GovernancePermission,
  GroupPermissionResourceType,
  PermissionType,
} from "@app/types/group_permissions";
import { MANAGEABLE_GROUP_KINDS } from "@app/types/groups";
import type {
  LightWorkspaceType,
  WorkspaceSharingPolicy,
} from "@app/types/user";
import {
  ActionFrame,
  ContentMessage,
  File04,
  IntersectDust,
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
    kinds: MANAGEABLE_GROUP_KINDS,
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

  const router = useAppRouter();
  const handleNavigateToGroups = () => {
    void router.push(`/w/${owner.sId}/members?tab=groups`);
  };

  const sections: {
    id: "agents" | "skills" | "frame" | "billing";
    label: string;
    icon: ComponentType;
    governancePermissions: GovernancePermission[];
  }[] = [
    {
      id: "agents",
      label: "Agents",
      icon: Robot,
      governancePermissions: governancePermissionsMap.agent ?? [],
    },
    {
      id: "skills",
      label: "Skills",
      icon: PuzzlePiece01,
      governancePermissions: governancePermissionsMap.skill ?? [],
    },
    ...(framePermissions.length > 0 || isAdmin
      ? [
          {
            id: "frame" as const,
            label: "Frame sharing",
            icon: ActionFrame,
            governancePermissions: framePermissions,
          },
        ]
      : []),
    ...(isAdmin
      ? [
          {
            id: "billing" as const,
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
        <Page.Header title="Workspace & Governance" description="Loading..." />
      </Page>
    );
  }

  return (
    <Page>
      <Page.Header
        title="Workspace & Governance"
        description="Manage what members can do in your workspace."
        icon={Toggle01Left}
      />
      <ContentMessage>
        This page is WIP. Do not change unless you know what you are doing.
      </ContentMessage>
      <WorkspaceNameEditor owner={owner} />
      <LinkedSectionNotice
        description="Groups assigned here are managed in"
        linkLabel="People → Groups"
        onLinkClick={handleNavigateToGroups}
      />
      <div className="flex w-full flex-col gap-8">
        {sections.map(({ id, label, icon, governancePermissions }) => (
          <GovernanceSettingSection key={id} label={label} icon={icon}>
            {id === "frame" && isAdmin && (
              <InteractiveContentSharing
                sharingPolicy={sharingPolicy}
                doUpdateSharingPolicy={doUpdateSharingPolicy}
                isChanging={isChanging}
              />
            )}
            {governancePermissions.map((governancePermission) => (
              <GovernanceSettingRow
                key={
                  governancePermission.permissionType +
                  ":" +
                  governancePermission.resourceType
                }
                governancePermission={governancePermission}
                groups={groups}
                onChange={(newConfiguration) =>
                  onPermissionChange({
                    permissionType: governancePermission.permissionType,
                    resourceType: governancePermission.resourceType,
                    configuration: newConfiguration,
                  })
                }
              />
            ))}
          </GovernanceSettingSection>
        ))}

        {isAdmin && (
          <>
            <GovernanceSettingSection label="Pods" icon={IntersectDust}>
              <OpenPodPolicy owner={owner} />
              <PodKnowledgePolicy owner={owner} />
            </GovernanceSettingSection>
            <GovernanceSettingSection label="Capabilities" icon={ShapesPlus}>
              <VoiceTranscriptionToggle owner={owner} />
              <EmailAgentsToggle owner={owner} />
              <PrivateConversationUrlsToggle owner={owner} />
              <DustMcpServerSettingsItem owner={owner} />
              <ExtensionMcpToolsSection owner={owner} />
              <SlackPersonalFooterRemovalToggle owner={owner} />
              <WorkspaceAnalyticsToggle owner={owner} />
            </GovernanceSettingSection>
            <GovernanceSettingSection label="Audit" icon={File04}>
              <AuditLogsToggle owner={owner} />
            </GovernanceSettingSection>
          </>
        )}
      </div>
    </Page>
  );
};
