import { GovernancePageLayout } from "@app/components/pages/workspace/governance/GovernancePageLayout";
import { GovernancePageSkeleton } from "@app/components/pages/workspace/governance/GovernancePageSkeleton";
import { GovernanceSettingRow } from "@app/components/pages/workspace/governance/GovernanceSettingRow";
import { GovernanceSettingSection } from "@app/components/pages/workspace/governance/GovernanceSettingSection";
import { SkillDiscoverabilityWarning } from "@app/components/pages/workspace/governance/SkillDiscoverabilityWarning";
import { ExtensionMcpToolsSection } from "@app/components/workspace/ExtensionMcpToolsSection";
import { LinkedSectionNotice } from "@app/components/workspace/LinkedSectionNotice";
import { AuditLogsGovernanceSection } from "@app/components/workspace/settings/AuditLogsToggle";
import { ConversationExternalNotificationsToggle } from "@app/components/workspace/settings/ConversationExternalNotificationsToggle";
import { DustMcpServerSettingsItem } from "@app/components/workspace/settings/DustMcpServerSettingsItem";
import { EmailAgentsToggle } from "@app/components/workspace/settings/EmailAgentsToggle";
import { InteractiveContentSharing } from "@app/components/workspace/settings/InteractiveContentSharingToggle";
import { MessagingAppToggles } from "@app/components/workspace/settings/MessagingAppToggles";
import { OpenPodPolicy } from "@app/components/workspace/settings/OpenPodsPolicy";
import { PodKnowledgePolicy } from "@app/components/workspace/settings/PodKnowledgePolicy";
import { PrivateConversationUrlsToggle } from "@app/components/workspace/settings/PrivateConversationUrlsToggle";
import { SlackPersonalFooterRemovalToggle } from "@app/components/workspace/settings/SlackPersonalFooterRemovalToggle";
import { VoiceTranscriptionToggle } from "@app/components/workspace/settings/VoiceTranscriptionToggle";
import { WorkspaceAnalyticsToggle } from "@app/components/workspace/settings/WorkspaceAnalyticsToggle";
import { WorkspaceDefaultAgentPicker } from "@app/components/workspace/settings/WorkspaceDefaultAgentPicker";
import { WorkspaceNameEditor } from "@app/components/workspace/settings/WorkspaceNameEditor";
import { useFrameSharingToggle } from "@app/hooks/useFrameSharingToggle";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import {
  useGovernancePermissions,
  useUpdateGovernancePermission,
} from "@app/lib/swr/governance";
import { useGroups } from "@app/lib/swr/groups";
import type { GovernancePermissionsByKey } from "@app/types/api/governance";
import type {
  CapabilitySpec,
  GovernancePermission,
  GrantType,
} from "@app/types/group_permissions";
import {
  capabilityKey,
  GOVERNANCE_CAPABILITIES,
} from "@app/types/group_permissions";
import { MANAGEABLE_GROUP_KINDS } from "@app/types/groups";
import { removeNulls } from "@app/types/shared/utils/general";
import type { WorkspaceSharingPolicy } from "@app/types/user";
import {
  ActionFrame,
  Clock,
  CloudArrowLeftRight,
  ContentMessage,
  Cube01,
  InfoCircle,
  Lock01,
  PuzzlePiece01,
  Robot,
  ShapesPlus,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";

// Frame governance permissions are only relevant when the workspace sharing policy actually
// enables the underlying capability: email invites require external email sharing, and public
// links require unrestricted sharing.
function isFrameCapabilityEnabled(
  grantType: GrantType,
  sharingPolicy: WorkspaceSharingPolicy
): boolean {
  switch (grantType) {
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

// Split the keyed permission map into the page's four sections. Each section pulls its capabilities
// from the map in catalog (display) order, dropping any the current user's role isn't allowed to
// see (absent from the map). Frame filtering by sharing policy is applied by the caller, which has
// the runtime policy.
function groupGovernancePermissionsBySection(
  governancePermissions: GovernancePermissionsByKey
): {
  agents: GovernancePermission[];
  skills: GovernancePermission[];
  frames: GovernancePermission[];
  billingAndSecurity: GovernancePermission[];
  triggers: GovernancePermission[];
} {
  const resolve = (specs: CapabilitySpec[]): GovernancePermission[] =>
    removeNulls(
      specs.map((spec) => governancePermissions[capabilityKey(spec)])
    );

  return {
    agents: resolve(GOVERNANCE_CAPABILITIES.agent),
    skills: resolve(GOVERNANCE_CAPABILITIES.skill),
    frames: resolve(GOVERNANCE_CAPABILITIES.frame),
    billingAndSecurity: resolve(GOVERNANCE_CAPABILITIES.billingAndSecurity),
    triggers: resolve(GOVERNANCE_CAPABILITIES.trigger),
  };
}

export const GovernancePage = () => {
  const owner = useWorkspace();
  const { isAdmin } = useAuth();
  const { groups, isGroupsLoading, isGroupsError } = useGroups({
    owner,
    kinds: MANAGEABLE_GROUP_KINDS,
  });
  const {
    governancePermissions,
    isLoading: isGovernancePermissionsLoading,
    isGovernancePermissionsError,
  } = useGovernancePermissions(owner);
  const onPermissionChange = useUpdateGovernancePermission(owner);

  const { sharingPolicy, doUpdateSharingPolicy, isChanging } =
    useFrameSharingToggle({ owner });

  const isLoading = isGroupsLoading || isGovernancePermissionsLoading;
  const isError = isGroupsError || isGovernancePermissionsError;

  const { agents, skills, frames, billingAndSecurity, triggers } =
    groupGovernancePermissionsBySection(governancePermissions);

  const framePermissions = frames.filter((permission) =>
    isFrameCapabilityEnabled(permission.grantType, sharingPolicy)
  );

  const router = useAppRouter();
  const handleNavigateToGroups = () => {
    void router.push(`/w/${owner.sId}/members?tab=groups`);
  };

  const sections: {
    id: "agents" | "skills" | "frame" | "automations" | "billing";
    label: string;
    icon: ComponentType;
    governancePermissions: GovernancePermission[];
  }[] = [
    {
      id: "agents",
      label: "Agents",
      icon: Robot,
      governancePermissions: agents,
    },
    {
      id: "skills",
      label: "Skills",
      icon: PuzzlePiece01,
      governancePermissions: skills,
    },
    ...(triggers.length > 0
      ? [
          {
            id: "automations" as const,
            label: "Automations",
            icon: Clock,
            governancePermissions: triggers,
          },
        ]
      : []),
    ...(framePermissions.length > 0 || isAdmin
      ? [
          {
            id: "frame" as const,
            label: "Frames",
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
            governancePermissions: billingAndSecurity,
          },
        ]
      : []),
  ];

  if (isLoading) {
    return <GovernancePageSkeleton />;
  }

  if (isError) {
    return (
      <GovernancePageLayout>
        <ContentMessage
          variant="warning"
          icon={InfoCircle}
          size="lg"
          title="Failed to load"
        >
          Governance settings could not be loaded.
        </ContentMessage>
      </GovernancePageLayout>
    );
  }

  return (
    <GovernancePageLayout>
      {isAdmin && <WorkspaceNameEditor owner={owner} />}
      <LinkedSectionNotice
        description="Groups assigned here are managed in"
        linkLabel="People → Groups"
        onLinkClick={handleNavigateToGroups}
      />
      <div className="flex w-full flex-col gap-8">
        {sections.map(
          ({ id, label, icon, governancePermissions: sectionPermissions }) => (
            <GovernanceSettingSection
              key={id}
              label={label}
              icon={icon}
              footer={
                id === "skills" ? (
                  <SkillDiscoverabilityWarning
                    governancePermissions={governancePermissions}
                    groups={groups}
                  />
                ) : undefined
              }
            >
              {id === "frame" && isAdmin && (
                <InteractiveContentSharing
                  sharingPolicy={sharingPolicy}
                  doUpdateSharingPolicy={doUpdateSharingPolicy}
                  isChanging={isChanging}
                />
              )}
              {sectionPermissions.map((governancePermission) => (
                <GovernanceSettingRow
                  key={capabilityKey(governancePermission)}
                  governancePermission={governancePermission}
                  groups={groups}
                  onChange={(newConfiguration) =>
                    onPermissionChange({
                      grantType: governancePermission.grantType,
                      resourceType: governancePermission.resourceType,
                      configuration: newConfiguration,
                    })
                  }
                />
              ))}
            </GovernanceSettingSection>
          )
        )}

        {isAdmin && (
          <>
            <GovernanceSettingSection label="Pods" icon={Cube01}>
              <OpenPodPolicy owner={owner} />
              <PodKnowledgePolicy owner={owner} />
            </GovernanceSettingSection>
            <GovernanceSettingSection label="Features" icon={ShapesPlus}>
              <WorkspaceDefaultAgentPicker owner={owner} />
              <VoiceTranscriptionToggle owner={owner} />
              <EmailAgentsToggle owner={owner} />
              <ConversationExternalNotificationsToggle owner={owner} />
              <PrivateConversationUrlsToggle owner={owner} />
              <DustMcpServerSettingsItem owner={owner} />
              <ExtensionMcpToolsSection owner={owner} />
              <SlackPersonalFooterRemovalToggle owner={owner} />
              <WorkspaceAnalyticsToggle owner={owner} />
            </GovernanceSettingSection>
            <GovernanceSettingSection
              label="Messaging apps"
              icon={CloudArrowLeftRight}
            >
              <MessagingAppToggles owner={owner} />
            </GovernanceSettingSection>
            <AuditLogsGovernanceSection owner={owner} />
          </>
        )}
      </div>
    </GovernancePageLayout>
  );
};
