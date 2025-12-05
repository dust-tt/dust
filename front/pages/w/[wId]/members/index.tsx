import {
  Page,
  SearchInput,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  UserIcon,
} from "@dust-tt/sparkle";
import { UsersIcon } from "@heroicons/react/20/solid";
import type { PaginationState } from "@tanstack/react-table";
import type { InferGetServerSidePropsType } from "next";
import { useCallback, useEffect, useState } from "react";

import type { WorkspaceLimit } from "@app/components/app/ReachedLimitPopup";
import { ReachedLimitPopup } from "@app/components/app/ReachedLimitPopup";
import { InvitationsList } from "@app/components/members/InvitationsList";
import { InviteEmailButtonWithModal } from "@app/components/members/InviteEmailButtonWithModal";
import { MembersList } from "@app/components/members/MembersList";
import { subNavigationAdmin } from "@app/components/navigation/config";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { ChangeMemberModal } from "@app/components/workspace/ChangeMemberModal";
import WorkspaceAccessPanel from "@app/components/workspace/WorkspaceAccessPanel";
import { WorkspaceSection } from "@app/components/workspace/WorkspaceSection";
import { checkWorkspaceSeatAvailabilityUsingAuth } from "@app/lib/api/workspace";
import { getWorkspaceVerifiedDomains } from "@app/lib/api/workspace_domains";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import { useSearchMembers } from "@app/lib/swr/memberships";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type {
  PlanType,
  SubscriptionPerSeatPricing,
  SubscriptionType,
  UserType,
  UserTypeWithWorkspace,
  WorkspaceDomain,
  WorkspaceType,
} from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  user: UserType;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  perSeatPricing: SubscriptionPerSeatPricing | null;
  plan: PlanType;
  workspaceHasAvailableSeats: boolean;
  workspaceVerifiedDomains: WorkspaceDomain[];
}>(async (context, auth) => {
  const plan = auth.plan();
  const owner = auth.workspace();
  const user = auth.user()?.toJSON();
  const subscriptionResource = auth.subscriptionResource();

  if (!owner || !user || !auth.isAdmin() || !plan || !subscriptionResource) {
    return {
      notFound: true,
    };
  }

  // TODO(workos 2025-06-09): Remove this once fully migrated to WorkOS.
  const workspaceVerifiedDomains = await getWorkspaceVerifiedDomains(owner);
  const workspaceHasAvailableSeats =
    await checkWorkspaceSeatAvailabilityUsingAuth(auth);

  const perSeatPricing = await subscriptionResource.getPerSeatPricing();
  const subscription = subscriptionResource.toJSON();

  return {
    props: {
      user,
      owner,
      subscription,
      perSeatPricing,
      plan,
      workspaceHasAvailableSeats,
      workspaceVerifiedDomains,
    },
  };
});

export default function WorkspaceAdmin({
  user,
  owner,
  subscription,
  perSeatPricing,
  plan,
  workspaceHasAvailableSeats,
  workspaceVerifiedDomains,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [searchTerm, setSearchTerm] = useState("");
  const [inviteBlockedPopupReason, setInviteBlockedPopupReason] =
    useState<WorkspaceLimit | null>(null);
  const hasVerifiedDomains = workspaceVerifiedDomains.length > 0;
  const isProvisioningEnabled =
    plan.limits.users.isSCIMAllowed && hasVerifiedDomains;
  const isManualInvitationsEnabled =
    owner.metadata?.disableManualInvitations !== true;

  const { featureFlags } = useFeatureFlags({ workspaceId: owner.sId });

  const onInviteClick = useCallback(
    (event: MouseEvent) => {
      if (!isUpgraded(plan)) {
        setInviteBlockedPopupReason("cant_invite_free_plan");
        event.preventDefault();
      } else if (subscription.paymentFailingSince) {
        setInviteBlockedPopupReason("cant_invite_payment_failure");
        event.preventDefault();
      } else if (!workspaceHasAvailableSeats) {
        setInviteBlockedPopupReason("cant_invite_no_seats_available");
        event.preventDefault();
      }
    },
    [plan, subscription.paymentFailingSince, workspaceHasAvailableSeats]
  );

  return (
    <AppCenteredLayout
      subscription={subscription}
      owner={owner}
      subNavigation={subNavigationAdmin({
        owner,
        current: "members",
        featureFlags,
      })}
    >
      <div className="mb-4">
        <Page.Vertical gap="lg" align="stretch">
          <Page.Header
            title="People & Security"
            icon={UsersIcon}
            description="Verify your domain, manage team members and their permissions."
          />
          <WorkspaceAccessPanel
            workspaceVerifiedDomains={workspaceVerifiedDomains}
            owner={owner}
            plan={plan}
          />
          <WorkspaceSection title="Members" icon={UserIcon}>
            <div className="flex flex-row gap-2">
              <SearchInput
                placeholder={
                  isProvisioningEnabled ? "Search" : "Search members (email)"
                }
                value={searchTerm}
                name="search"
                onChange={setSearchTerm}
              />
              {isManualInvitationsEnabled && (
                <InviteEmailButtonWithModal
                  owner={owner}
                  prefillText=""
                  perSeatPricing={perSeatPricing}
                  onInviteClick={onInviteClick}
                />
              )}
            </div>
            <WorkspaceMembersGroupsList
              currentUser={user}
              owner={owner}
              searchTerm={searchTerm}
              isProvisioningEnabled={isProvisioningEnabled}
              isManualInvitationsEnabled={isManualInvitationsEnabled}
            />
          </WorkspaceSection>
          {inviteBlockedPopupReason && (
            <ReachedLimitPopup
              isOpened={!!inviteBlockedPopupReason}
              onClose={() => setInviteBlockedPopupReason(null)}
              subscription={subscription}
              owner={owner}
              code={inviteBlockedPopupReason}
            />
          )}
        </Page.Vertical>
      </div>
    </AppCenteredLayout>
  );
}

const DEFAULT_PAGE_SIZE = 25;

interface WorkspaceMembersGroupsListProps {
  currentUser: UserType | null;
  isProvisioningEnabled: boolean;
  isManualInvitationsEnabled: boolean;
  owner: WorkspaceType;
  searchTerm: string;
}

function WorkspaceMembersGroupsList({
  currentUser,
  isProvisioningEnabled,
  isManualInvitationsEnabled,
  owner,
  searchTerm,
}: WorkspaceMembersGroupsListProps) {
  return (
    <div className="flex flex-col gap-1 pt-2">
      <Tabs defaultValue="members">
        <TabsList className="mb-4">
          <TabsTrigger value="members" label="Members" />
          {isManualInvitationsEnabled && (
            <TabsTrigger value="invitations" label="Invitations" />
          )}
        </TabsList>
        <TabsContent value="members">
          <WorkspaceMembersList
            currentUser={currentUser}
            owner={owner}
            searchTerm={searchTerm}
            isProvisioningEnabled={isProvisioningEnabled}
          />
        </TabsContent>
        {isManualInvitationsEnabled && (
          <TabsContent value="invitations">
            <InvitationsList owner={owner} searchText={searchTerm} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

interface WorkspaceMembersListProps {
  currentUser: UserType | null;
  owner: WorkspaceType;
  searchTerm: string;
  isProvisioningEnabled: boolean;
}

function WorkspaceMembersList({
  currentUser,
  owner,
  searchTerm,
  isProvisioningEnabled,
}: WorkspaceMembersListProps) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  const [selectedMember, setSelectedMember] =
    useState<UserTypeWithWorkspace | null>(null);

  const membersData = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm,
    pageIndex: pagination.pageIndex,
    pageSize: DEFAULT_PAGE_SIZE,
    groupKind: isProvisioningEnabled ? "provisioned" : undefined,
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPagination({ pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE });
  }, [setPagination]);

  const resetSelectedMember = useCallback(() => {
    setSelectedMember(null);
  }, [setSelectedMember]);

  return (
    <>
      <MembersList
        currentUser={currentUser}
        membersData={membersData}
        onRowClick={setSelectedMember}
        showColumns={
          isProvisioningEnabled
            ? ["name", "email", "role", "status", "groups"]
            : ["name", "email", "role"]
        }
        pagination={pagination}
        setPagination={setPagination}
      />
      <ChangeMemberModal
        onClose={resetSelectedMember}
        member={selectedMember}
        mutateMembers={membersData.mutateRegardlessOfQueryParams}
        workspace={owner}
      />
    </>
  );
}

WorkspaceAdmin.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
