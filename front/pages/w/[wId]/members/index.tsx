import {
  Page,
  SearchInput,
  Separator,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { UsersIcon } from "@heroicons/react/20/solid";
import type { PaginationState } from "@tanstack/react-table";
import type { InferGetServerSidePropsType } from "next";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { WorkspaceLimit } from "@app/components/app/ReachedLimitPopup";
import { ReachedLimitPopup } from "@app/components/app/ReachedLimitPopup";
import { GroupsList } from "@app/components/groups/GroupsList";
import { InviteEmailModal } from "@app/components/members/InvitationModal";
import { InvitationsList } from "@app/components/members/InvitationsList";
import { MembersList } from "@app/components/members/MembersList";
import { subNavigationAdmin } from "@app/components/navigation/config";
import AppContentLayout from "@app/components/sparkle/AppContentLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { ChangeMemberModal } from "@app/components/workspace/ChangeMemberModal";
import WorkspaceAccessPanel from "@app/components/workspace/WorkspaceAccessPanel";
import { checkWorkspaceSeatAvailabilityUsingAuth } from "@app/lib/api/workspace";
import { getWorkspaceVerifiedDomains } from "@app/lib/api/workspace_domains";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import { useGroups } from "@app/lib/swr/groups";
import { useSearchMembers } from "@app/lib/swr/memberships";
import { useWorkOSSSOStatus } from "@app/lib/swr/workos";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type {
  PlanType,
  SubscriptionPerSeatPricing,
  SubscriptionType,
  UserType,
  UserTypeWithWorkspaces,
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

  const { featureFlags } = useFeatureFlags({ workspaceId: owner.sId });
  const hasWorkOSProvisioning = useMemo(
    () => featureFlags.includes("workos_user_provisioning"),
    [featureFlags]
  );

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
    <AppContentLayout
      subscription={subscription}
      owner={owner}
      subNavigation={subNavigationAdmin({ owner, current: "members" })}
    >
      <Page.Vertical gap="lg" align="stretch">
        <Page.Header
          title="Domain & Members"
          icon={UsersIcon}
          description="Verify your domain, manage team members and their permissions."
        />
        <WorkspaceAccessPanel
          workspaceVerifiedDomains={workspaceVerifiedDomains}
          owner={owner}
          plan={plan}
        />
        <Separator />
        <div className="flex flex-col gap-2">
          <Page.H variant="h4">
            {hasWorkOSProvisioning ? "Members and directories" : "Member list"}
          </Page.H>
          <div className="flex flex-row gap-2">
            <SearchInput
              placeholder={
                hasWorkOSProvisioning ? "Search" : "Search members (email)"
              }
              value={searchTerm}
              name="search"
              onChange={setSearchTerm}
            />
            <InviteEmailModal
              owner={owner}
              prefillText=""
              perSeatPricing={perSeatPricing}
              onInviteClick={onInviteClick}
            />
          </div>
          <InvitationsList owner={owner} searchText={searchTerm} />
          <WorkspaceMembersGroupsList
            currentUser={user}
            owner={owner}
            searchTerm={searchTerm}
          />
        </div>
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
    </AppContentLayout>
  );
}

const DEFAULT_PAGE_SIZE = 25;

interface WorkspaceMembersListProps {
  currentUser: UserType | null;
  owner: WorkspaceType;
  searchTerm: string;
}

function WorkspaceMembersGroupsList({
  currentUser,
  owner,
  searchTerm,
}: WorkspaceMembersListProps) {
  const { hasFeature, isFeatureFlagsLoading } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const { ssoStatus, isLoading } = useWorkOSSSOStatus({ owner });

  if (isFeatureFlagsLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 pt-2">
      {hasFeature("workos_user_provisioning") ? (
        <Tabs defaultValue="members">
          <TabsList className="mb-4">
            <TabsTrigger value="members" label="Members" />
            <TabsTrigger
              value="directories"
              label={`Directories${ssoStatus?.connection ? ` (${ssoStatus.connection.type})` : ""}`}
            />
          </TabsList>
          <TabsContent value="members">
            <WorkspaceMembersList
              currentUser={currentUser}
              owner={owner}
              searchTerm={searchTerm}
            />
          </TabsContent>
          <TabsContent value="directories">
            <WorkspaceGroupsList owner={owner} searchTerm={searchTerm} />
          </TabsContent>
        </Tabs>
      ) : (
        <>
          <Page.H variant="h6">Members</Page.H>
          <WorkspaceMembersList
            currentUser={currentUser}
            owner={owner}
            searchTerm={searchTerm}
          />
        </>
      )}
    </div>
  );
}

function WorkspaceMembersList({
  currentUser,
  owner,
  searchTerm,
}: {
  currentUser: UserType | null;
  owner: WorkspaceType;
  searchTerm: string;
}) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  const [selectedMember, setSelectedMember] =
    useState<UserTypeWithWorkspaces | null>(null);

  const membersData = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm,
    pageIndex: pagination.pageIndex,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  useEffect(() => {
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
        showColumns={["name", "email", "role"]}
        pagination={pagination}
        setPagination={setPagination}
      />
      <ChangeMemberModal
        onClose={resetSelectedMember}
        member={selectedMember}
        mutateMembers={membersData.mutateRegardlessOfQueryParams}
      />
    </>
  );
}

function WorkspaceGroupsList({
  owner,
  searchTerm,
}: {
  owner: WorkspaceType;
  searchTerm: string;
}) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  const { groups, isGroupsLoading } = useGroups({
    owner,
    kinds: ["provisioned"],
  });

  useEffect(() => {
    setPagination({ pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE });
  }, [setPagination]);

  return (
    <GroupsList
      searchTerm={searchTerm}
      isLoading={isGroupsLoading}
      groups={groups}
      showColumns={["name", "memberCount"]}
      pagination={pagination}
      setPagination={setPagination}
    />
  );
}

WorkspaceAdmin.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
