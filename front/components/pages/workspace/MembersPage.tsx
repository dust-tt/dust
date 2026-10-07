import { WorkspaceGroupsList } from "@app/components/groups/WorkspaceGroupsList";
import { AdminPageContainer } from "@app/components/layouts/AdminPageContainer";
import { AdminSectionAnchor } from "@app/components/layouts/AdminSectionAnchor";
import { WorkspaceMembersSection } from "@app/components/members/WorkspaceMembersSection";
import { GovernanceSettingRow } from "@app/components/pages/workspace/governance/GovernanceSettingRow";
import { GovernanceSettingSection } from "@app/components/pages/workspace/governance/GovernanceSettingSection";
import { RoleProvisioningSection } from "@app/components/pages/workspace/governance/RoleProvisioningSection";
import UserProvisioning from "@app/components/workspace/DirectorySync";
import { AutoJoinToggle } from "@app/components/workspace/sso/AutoJoinToggle";
import { useAdminPageTab } from "@app/hooks/useAdminPageTab";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { isSCIMEnabled } from "@app/lib/plans/scim";
import {
  useGovernancePermissions,
  useUpdateGovernancePermission,
} from "@app/lib/swr/governance";
import { useGroups } from "@app/lib/swr/groups";
import { useWorkspaceDomains } from "@app/lib/swr/workos";
import {
  usePerSeatPricing,
  useWorkspaceSeatAvailability,
  useWorkspaceVerifiedDomains,
} from "@app/lib/swr/workspaces";
import {
  capabilityKey,
  GOVERNANCE_CAPABILITIES,
} from "@app/types/group_permissions";
import { MANAGEABLE_GROUP_KINDS } from "@app/types/groups";
import { removeNulls } from "@app/types/shared/utils/general";
import {
  Lock01,
  Page,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

const MEMBERS_TABS = ["members", "groups", "roles"] as const;
type MembersTab = (typeof MEMBERS_TABS)[number];

/**
 * @cc [owner:philipperolet,label:security;react] scoped-people-page
 * Delegated callers MUST see all workspace members but only managed groups. They MUST NOT mount
 * workspace invitation, pricing, seat availability, or verified-domain data hooks. Their editable
 * groups may be fewer than their visible groups; provisioned and admin-granting groups remain visible.
 */
export function MembersPage() {
  const { t } = useLingui();
  const owner = useWorkspace();
  const { subscription, user, isManager, isAdmin } = useAuth();
  const { tab, setTab } = useAdminPageTab<MembersTab>(MEMBERS_TABS, "members");
  const activeTab: MembersTab = tab === "roles" && !isAdmin ? "members" : tab;

  return (
    <AdminPageContainer>
      <div className="flex flex-col gap-6">
        <Page.Header
          title={t`Members`}
          description={t`Manage team members and their roles.`}
        />
        <Tabs
          value={activeTab}
          onValueChange={(value) => setTab(value as MembersTab)}
        >
          <TabsList className="mb-6">
            <TabsTrigger value="members" label={t`Members`} />
            <TabsTrigger value="groups" label={t`Groups`} />
            {isAdmin && <TabsTrigger value="roles" label={t`Roles`} />}
          </TabsList>
          <TabsContent value="members" className="flex flex-col gap-4">
            <AdminSectionAnchor sectionId={ADMIN_SECTION_IDS.people.members}>
              {isManager ? (
                <WorkspacePeopleMembers />
              ) : (
                <WorkspaceMembersSection
                  currentUser={user}
                  owner={owner}
                  subscription={subscription}
                  isProvisioningEnabled={false}
                  isManualInvitationsEnabled={false}
                  perSeatPricing={null}
                  hasAvailableSeats={false}
                />
              )}
            </AdminSectionAnchor>
            {isAdmin && (
              <AdminSectionAnchor sectionId={ADMIN_SECTION_IDS.people.joining}>
                <JoiningTheWorkspaceSection />
              </AdminSectionAnchor>
            )}
          </TabsContent>
          <TabsContent value="groups" className="flex flex-col gap-4">
            <AdminSectionAnchor sectionId={ADMIN_SECTION_IDS.people.groups}>
              <WorkspaceGroupsList owner={owner} />
            </AdminSectionAnchor>
            {isAdmin && <DirectorySyncSection />}
          </TabsContent>
          {isAdmin && (
            <TabsContent value="roles" className="flex flex-col gap-4">
              <MembersRolesTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AdminPageContainer>
  );
}

function WorkspacePeopleMembers() {
  const owner = useWorkspace();
  const { subscription, user } = useAuth();
  const plan = subscription.plan;
  const { verifiedDomains, isVerifiedDomainsLoading } =
    useWorkspaceVerifiedDomains({ workspaceId: owner.sId });
  const { hasAvailableSeats, isSeatAvailabilityLoading } =
    useWorkspaceSeatAvailability({ workspaceId: owner.sId });
  const { perSeatPricing, isPerSeatPricingLoading } = usePerSeatPricing({
    workspaceId: owner.sId,
  });

  const hasVerifiedDomains = verifiedDomains.length > 0;
  const isProvisioningEnabled = isSCIMEnabled(plan) && hasVerifiedDomains;
  const isManualInvitationsEnabled =
    owner.metadata?.disableManualInvitations !== true;

  const isLoading =
    isVerifiedDomainsLoading ||
    isSeatAvailabilityLoading ||
    isPerSeatPricingLoading;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <WorkspaceMembersSection
      currentUser={user}
      owner={owner}
      isProvisioningEnabled={isProvisioningEnabled}
      isManualInvitationsEnabled={isManualInvitationsEnabled}
      subscription={subscription}
      perSeatPricing={perSeatPricing}
      hasAvailableSeats={hasAvailableSeats}
    />
  );
}

// "Joining the workspace" surfaces auto-join under Members, alongside the
// member list it governs. Domain data and SSO live on the Security page.
function JoiningTheWorkspaceSection() {
  const owner = useWorkspace();
  const { subscription } = useAuth();
  const plan = subscription.plan;
  const { domains } = useWorkspaceDomains({ owner });
  const { verifiedDomains, isVerifiedDomainsLoading } =
    useWorkspaceVerifiedDomains({ workspaceId: owner.sId });

  if (isVerifiedDomainsLoading) {
    return null;
  }

  return (
    <AutoJoinToggle
      domains={domains}
      workspaceVerifiedDomains={verifiedDomains}
      owner={owner}
      plan={plan}
    />
  );
}

// SCIM/directory sync is tied to the groups it provisions, so it lives next
// to the groups list once SCIM is enabled for the workspace.
function DirectorySyncSection() {
  const owner = useWorkspace();
  const { subscription } = useAuth();
  const plan = subscription.plan;

  if (!isSCIMEnabled(plan)) {
    return null;
  }

  return <UserProvisioning owner={owner} plan={plan} />;
}

// Roles moved from Governance: role-granting groups, plus the billing and
// security governance capabilities that used to live in that page's
// "Billing and security" section.
function MembersRolesTab() {
  const { t } = useLingui();
  const owner = useWorkspace();
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

  const isLoading = isGroupsLoading || isGovernancePermissionsLoading;
  const isError = isGroupsError || isGovernancePermissionsError;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return null;
  }

  const billingAndSecurityPermissions = removeNulls(
    GOVERNANCE_CAPABILITIES.billingAndSecurity.map(
      (spec) => governancePermissions[capabilityKey(spec)]
    )
  );

  return (
    <div className="flex flex-col gap-8">
      <RoleProvisioningSection owner={owner} groups={groups} />
      <GovernanceSettingSection
        sectionId={ADMIN_SECTION_IDS.governance.billing}
        label={t`Billing and security`}
        icon={Lock01}
      >
        {billingAndSecurityPermissions.map((governancePermission) => (
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
    </div>
  );
}
