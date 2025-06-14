import { Page, SearchInput, Separator } from "@dust-tt/sparkle";
import { UsersIcon } from "@heroicons/react/20/solid";
import type { PaginationState } from "@tanstack/react-table";
import type { InferGetServerSidePropsType } from "next";
import { useEffect, useMemo, useState } from "react";

import type { WorkspaceLimit } from "@app/components/app/ReachedLimitPopup";
import { ReachedLimitPopup } from "@app/components/app/ReachedLimitPopup";
import { InviteEmailModal } from "@app/components/members/InvitationModal";
import { InvitationsList } from "@app/components/members/InvitationsList";
import { MembersList } from "@app/components/members/MembersList";
import { subNavigationAdmin } from "@app/components/navigation/config";
import AppContentLayout from "@app/components/sparkle/AppContentLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { ChangeMemberModal } from "@app/components/workspace/ChangeMemberModal";
import type { EnterpriseConnectionStrategyDetails } from "@app/components/workspace/SSOConnection";
import WorkspaceAccessPanel from "@app/components/workspace/WorkspaceAccessPanel";
import config from "@app/lib/api/config";
import {
  makeAudienceUri,
  makeEnterpriseConnectionInitiateLoginUrl,
  makeSamlAcsUrl,
} from "@app/lib/api/enterprise_connection";
import {
  checkWorkspaceSeatAvailabilityUsingAuth,
  getWorkspaceVerifiedDomains,
} from "@app/lib/api/workspace";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import { useSearchMembers } from "@app/lib/swr/memberships";
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
  enterpriseConnectionStrategyDetails: EnterpriseConnectionStrategyDetails;
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

  const enterpriseConnectionStrategyDetails: EnterpriseConnectionStrategyDetails =
    {
      callbackUrl: config.getAuth0TenantUrl(),
      initiateLoginUrl: await makeEnterpriseConnectionInitiateLoginUrl(
        owner.sId,
        null
      ),
      // SAML specific.
      audienceUri: makeAudienceUri(owner),
      samlAcsUrl: makeSamlAcsUrl(owner),
    };

  const perSeatPricing = await subscriptionResource.getPerSeatPricing();
  const subscription = subscriptionResource.toJSON();

  return {
    props: {
      user,
      owner,
      subscription,
      perSeatPricing,
      enterpriseConnectionStrategyDetails,
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
  enterpriseConnectionStrategyDetails,
  plan,
  workspaceHasAvailableSeats,
  workspaceVerifiedDomains,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [searchTerm, setSearchTerm] = useState("");
  const [inviteBlockedPopupReason, setInviteBlockedPopupReason] =
    useState<WorkspaceLimit | null>(null);

  const onInviteClick = (event: MouseEvent) => {
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
  };

  const popup = useMemo(() => {
    if (!inviteBlockedPopupReason) {
      return <></>;
    }

    return (
      <ReachedLimitPopup
        isOpened={!!inviteBlockedPopupReason}
        onClose={() => setInviteBlockedPopupReason(null)}
        subscription={subscription}
        owner={owner}
        code={inviteBlockedPopupReason}
      />
    );
  }, [inviteBlockedPopupReason, owner, subscription]);

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
          enterpriseConnectionStrategyDetails={
            enterpriseConnectionStrategyDetails
          }
          workspaceVerifiedDomains={workspaceVerifiedDomains}
          owner={owner}
          plan={plan}
        />
        <Separator />
        <div className="flex flex-col gap-2">
          <Page.H variant="h4">Member list</Page.H>
          <div className="flex flex-row gap-2">
            <SearchInput
              placeholder="Search members (email)"
              value={searchTerm}
              name="search"
              onChange={(s) => {
                setSearchTerm(s);
              }}
            />
            <InviteEmailModal
              owner={owner}
              prefillText=""
              perSeatPricing={perSeatPricing}
              onInviteClick={onInviteClick}
            />
          </div>
          <InvitationsList owner={owner} searchText={searchTerm} />
          <WorkspaceMembersList
            currentUser={user}
            owner={owner}
            searchTerm={searchTerm}
          />
        </div>
        {popup}
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

function WorkspaceMembersList({
  currentUser,
  owner,
  searchTerm,
}: WorkspaceMembersListProps) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  const membersData = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm,
    pageIndex: pagination.pageIndex,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  useEffect(() => {
    setPagination({ pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE });
  }, [setPagination]);

  const [selectedMember, setSelectedMember] =
    useState<UserTypeWithWorkspaces | null>(null);

  return (
    <div className="flex flex-col gap-1 pt-2">
      <Page.H variant="h6">Members</Page.H>
      <MembersList
        currentUser={currentUser}
        membersData={membersData}
        onRowClick={setSelectedMember}
        showColumns={["name", "email", "role"]}
        pagination={pagination}
        setPagination={setPagination}
      />
      <ChangeMemberModal
        onClose={() => setSelectedMember(null)}
        member={selectedMember}
        mutateMembers={membersData.mutateRegardlessOfQueryParams}
      />
    </div>
  );
}

WorkspaceAdmin.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
