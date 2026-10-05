import { AdminSectionAnchor } from "@app/components/layouts/AdminSectionAnchor";
import { GovernancePageLayout } from "@app/components/pages/workspace/governance/GovernancePageLayout";
import { GovernancePageSkeleton } from "@app/components/pages/workspace/governance/GovernancePageSkeleton";
import { GovernanceSettingRow } from "@app/components/pages/workspace/governance/GovernanceSettingRow";
import { GovernanceSettingSection } from "@app/components/pages/workspace/governance/GovernanceSettingSection";
import { SkillDiscoverabilityWarning } from "@app/components/pages/workspace/governance/SkillDiscoverabilityWarning";
import { LinkedSectionNotice } from "@app/components/workspace/LinkedSectionNotice";
import { ConversationExternalNotificationsToggle } from "@app/components/workspace/settings/ConversationExternalNotificationsToggle";
import { InactiveAgentArchival } from "@app/components/workspace/settings/InactiveAgentArchival";
import { InteractiveContentSharing } from "@app/components/workspace/settings/InteractiveContentSharingToggle";
import { OpenPodPolicy } from "@app/components/workspace/settings/OpenPodsPolicy";
import { PodKnowledgePolicy } from "@app/components/workspace/settings/PodKnowledgePolicy";
import { PrivateConversationUrlsToggle } from "@app/components/workspace/settings/PrivateConversationUrlsToggle";
import { SelfImprovingSkillsListSection } from "@app/components/workspace/settings/SelfImprovingSkillsListSection";
import { SelfImprovingSkillsSettingsSection } from "@app/components/workspace/settings/SelfImprovingSkillsSettingsSection";
import { VoiceTranscriptionToggle } from "@app/components/workspace/settings/VoiceTranscriptionToggle";
import { WorkspaceAnalyticsToggle } from "@app/components/workspace/settings/WorkspaceAnalyticsToggle";
import { WorkspaceDefaultAgentPicker } from "@app/components/workspace/settings/WorkspaceDefaultAgentPicker";
import { WorkspaceLocalePicker } from "@app/components/workspace/settings/WorkspaceLocalePicker";
import { WorkspaceNameEditor } from "@app/components/workspace/settings/WorkspaceNameEditor";
import { useAdminPageTab } from "@app/hooks/useAdminPageTab";
import { useFrameSharingToggle } from "@app/hooks/useFrameSharingToggle";
import type { AdminSectionId } from "@app/lib/admin/adminSectionIds";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useIsSelfImprovementAvailable } from "@app/lib/client/self_improvement";
import { useAppRouter } from "@app/lib/platform";
import {
  getWorkspaceDefaultSelfImprovementCapPerSkillAwuCredits,
  getWorkspaceDefaultSelfImprovementCapPerSkillMicroUsd,
} from "@app/lib/reinforcement/consumption";
import {
  useGovernancePermissions,
  useUpdateGovernancePermission,
} from "@app/lib/swr/governance";
import { useGroups } from "@app/lib/swr/groups";
import { useReinforcementBillingUnit } from "@app/lib/swr/useSelfImprovingSkillsSettings";
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
  ContentMessage,
  Cube01,
  InfoCircle,
  PuzzlePiece01,
  Robot,
  ShapesPlus,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { useState } from "react";

const GOVERNANCE_TABS = ["agents", "pods", "features"] as const;
type GovernanceTab = (typeof GOVERNANCE_TABS)[number];

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

// Split the keyed permission map into the page's sections. Each section pulls its capabilities
// from the map in catalog (display) order, dropping any the current user's role isn't allowed to
// see (absent from the map). Frame filtering by sharing policy is applied by the caller, which has
// the runtime policy.
function groupGovernancePermissionsBySection(
  governancePermissions: GovernancePermissionsByKey
): {
  agents: GovernancePermission[];
  skills: GovernancePermission[];
  frames: GovernancePermission[];
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

  const hasSelfImprovement = useIsSelfImprovementAvailable();
  const reinforcementUnit = useReinforcementBillingUnit({ owner });
  const [defaultCapPerSkill, setDefaultCapPerSkill] = useState(() =>
    reinforcementUnit === "awu_credits"
      ? getWorkspaceDefaultSelfImprovementCapPerSkillAwuCredits(owner)
      : getWorkspaceDefaultSelfImprovementCapPerSkillMicroUsd(owner) / 1_000_000
  );

  const { tab, setTab } = useAdminPageTab<GovernanceTab>(
    GOVERNANCE_TABS,
    "agents"
  );

  const isLoading = isGroupsLoading || isGovernancePermissionsLoading;
  const isError = isGroupsError || isGovernancePermissionsError;

  const { agents, skills, frames, triggers } =
    groupGovernancePermissionsBySection(governancePermissions);

  const framePermissions = frames.filter((permission) =>
    isFrameCapabilityEnabled(permission.grantType, sharingPolicy)
  );

  const router = useAppRouter();
  const handleNavigateToGroups = () => {
    void router.push(`/w/${owner.sId}/members?tab=groups`);
  };

  const agentsSections: {
    sectionId: AdminSectionId;
    label: string;
    icon: ComponentType;
    governancePermissions: GovernancePermission[];
  }[] = [
    {
      sectionId: ADMIN_SECTION_IDS.governance.agents,
      label: "Agents",
      icon: Robot,
      governancePermissions: agents,
    },
    {
      sectionId: ADMIN_SECTION_IDS.governance.skills,
      label: "Skills",
      icon: PuzzlePiece01,
      governancePermissions: skills,
    },
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
        linkLabel="Members → Groups"
        onLinkClick={handleNavigateToGroups}
      />
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as GovernanceTab)}
      >
        <TabsList className="mb-6">
          <TabsTrigger value="agents" label="Agents" />
          <TabsTrigger value="pods" label="Pods" />
          <TabsTrigger value="features" label="Features" />
        </TabsList>
        <TabsContent value="agents" className="flex w-full flex-col gap-8">
          {agentsSections.map(
            ({
              sectionId,
              label,
              icon,
              governancePermissions: sectionPermissions,
            }) => (
              <GovernanceSettingSection
                key={sectionId}
                sectionId={sectionId}
                label={label}
                icon={icon}
                footer={
                  sectionId === ADMIN_SECTION_IDS.governance.skills ? (
                    <SkillDiscoverabilityWarning
                      governancePermissions={governancePermissions}
                      groups={groups}
                    />
                  ) : undefined
                }
              >
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
          {hasSelfImprovement && (
            <>
              <AdminSectionAnchor
                sectionId={ADMIN_SECTION_IDS.selfImprovingSkills.settings}
              >
                <SelfImprovingSkillsSettingsSection
                  owner={owner}
                  showCaps={false}
                  onDefaultCapPerSkillSaved={setDefaultCapPerSkill}
                />
              </AdminSectionAnchor>
              <AdminSectionAnchor
                sectionId={ADMIN_SECTION_IDS.selfImprovingSkills.skills}
              >
                <SelfImprovingSkillsListSection
                  owner={owner}
                  defaultCapPerSkill={defaultCapPerSkill}
                />
              </AdminSectionAnchor>
            </>
          )}
        </TabsContent>
        <TabsContent value="pods" className="flex w-full flex-col gap-8">
          {(framePermissions.length > 0 || isAdmin) && (
            <GovernanceSettingSection
              sectionId={ADMIN_SECTION_IDS.governance.frame}
              label="Frames"
              icon={ActionFrame}
            >
              {isAdmin && (
                <InteractiveContentSharing
                  sharingPolicy={sharingPolicy}
                  doUpdateSharingPolicy={doUpdateSharingPolicy}
                  isChanging={isChanging}
                />
              )}
              {framePermissions.map((governancePermission) => (
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
          )}
          {triggers.length > 0 && (
            <GovernanceSettingSection
              sectionId={ADMIN_SECTION_IDS.governance.automations}
              label="Automations"
              icon={Clock}
            >
              {triggers.map((governancePermission) => (
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
          )}
          {isAdmin && (
            <GovernanceSettingSection
              sectionId={ADMIN_SECTION_IDS.governance.pods}
              label="Pods"
              icon={Cube01}
            >
              <OpenPodPolicy owner={owner} />
              <PodKnowledgePolicy owner={owner} />
            </GovernanceSettingSection>
          )}
        </TabsContent>
        <TabsContent value="features" className="flex w-full flex-col gap-8">
          {isAdmin && (
            <GovernanceSettingSection
              sectionId={ADMIN_SECTION_IDS.governance.features}
              label="Features"
              icon={ShapesPlus}
            >
              <WorkspaceDefaultAgentPicker owner={owner} />
              <WorkspaceLocalePicker owner={owner} />
              <VoiceTranscriptionToggle owner={owner} />
              <ConversationExternalNotificationsToggle owner={owner} />
              <PrivateConversationUrlsToggle owner={owner} />
              <WorkspaceAnalyticsToggle owner={owner} />
              <InactiveAgentArchival owner={owner} />
            </GovernanceSettingSection>
          )}
        </TabsContent>
      </Tabs>
    </GovernancePageLayout>
  );
};
