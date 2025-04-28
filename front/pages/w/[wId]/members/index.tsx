import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Page,
  Popup,
  SearchInput,
  useSendNotification,
} from "@dust-tt/sparkle";
import { UsersIcon } from "@heroicons/react/20/solid";
import type { PaginationState } from "@tanstack/react-table";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

import type { WorkspaceLimit } from "@app/components/app/ReachedLimitPopup";
import { ReachedLimitPopup } from "@app/components/app/ReachedLimitPopup";
import { InviteEmailModal } from "@app/components/members/InvitationModal";
import { InvitationsList } from "@app/components/members/InvitationsList";
import { MembersList } from "@app/components/members/MembersList";
import { subNavigationAdmin } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { ChangeMemberModal } from "@app/components/workspace/ChangeMemberModal";
import type { EnterpriseConnectionStrategyDetails } from "@app/components/workspace/connection";
import { EnterpriseConnectionDetails } from "@app/components/workspace/connection";
import config from "@app/lib/api/config";
import {
  makeAudienceUri,
  makeEnterpriseConnectionInitiateLoginUrl,
  makeSamlAcsUrl,
} from "@app/lib/api/enterprise_connection";
import {
  checkWorkspaceSeatAvailabilityUsingAuth,
  getWorkspaceVerifiedDomain,
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
  workspaceVerifiedDomain: WorkspaceDomain | null;
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

  const workspaceVerifiedDomain = await getWorkspaceVerifiedDomain(owner);
  const workspaceHasAvailableSeats =
    await checkWorkspaceSeatAvailabilityUsingAuth(auth);

  const enterpriseConnectionStrategyDetails: EnterpriseConnectionStrategyDetails =
    {
      callbackUrl: config.getAuth0TenantUrl(),
      initiateLoginUrl: makeEnterpriseConnectionInitiateLoginUrl(
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
      workspaceVerifiedDomain,
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
  workspaceVerifiedDomain,
  workspaceHasAvailableSeats,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [showNoInviteLinkPopup, setShowNoInviteLinkPopup] = useState(false);
  const [isActivateAutoJoinOpened, setIsActivateAutoJoinOpened] =
    useState(false);
  const [inviteBlockedPopupReason, setInviteBlockedPopupReason] =
    useState<WorkspaceLimit | null>(null);

  const { domain = "", domainAutoJoinEnabled = false } =
    workspaceVerifiedDomain ?? {};

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
    <AppLayout
      subscription={subscription}
      owner={owner}
      subNavigation={subNavigationAdmin({ owner, current: "members" })}
    >
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Member Management"
          icon={UsersIcon}
          description="Invite and remove members, manage their rights."
        />
        <DomainAutoJoinModal
          domainAutoJoinEnabled={domainAutoJoinEnabled}
          isOpen={isActivateAutoJoinOpened}
          onClose={() => {
            setIsActivateAutoJoinOpened(false);
          }}
          domain={domain}
          owner={owner}
        />
        {workspaceVerifiedDomain && (
          <Page.Vertical gap="sm">
            <Page.H variant="h5">Auto-join Workspace</Page.H>
            <Page.P variant="secondary">
              Allow all your team members to access your Dust company Workspace
              when they authenticate with a{" "}
              <span className="font-bold">"@{domain}"</span> Google accounts.
            </Page.P>
            <div className="flex flex-col items-start gap-3">
              {domainAutoJoinEnabled ? (
                <Button
                  label="De-activate Auto-join"
                  size="sm"
                  variant="warning"
                  disabled={!domainAutoJoinEnabled}
                  onClick={() => {
                    if (!isUpgraded(plan)) {
                      setShowNoInviteLinkPopup(true);
                    } else {
                      setIsActivateAutoJoinOpened(true);
                    }
                  }}
                />
              ) : (
                <Button
                  label="Activate Auto-join"
                  size="sm"
                  variant="primary"
                  disabled={domainAutoJoinEnabled}
                  onClick={() => {
                    if (!isUpgraded(plan)) {
                      setShowNoInviteLinkPopup(true);
                    } else {
                      setIsActivateAutoJoinOpened(true);
                    }
                  }}
                />
              )}
              <Popup
                show={showNoInviteLinkPopup}
                chipLabel="Free plan"
                description="You cannot enable auto-join with the free plan. Upgrade your plan to invite other members."
                buttonLabel="Check Dust plans"
                buttonClick={() => {
                  void router.push(`/w/${owner.sId}/subscription`);
                }}
                className="absolute bottom-8 right-0"
                onClose={() => setShowNoInviteLinkPopup(false)}
              />
            </div>
          </Page.Vertical>
        )}
        <EnterpriseConnectionDetails
          owner={owner}
          plan={plan}
          strategyDetails={enterpriseConnectionStrategyDetails}
          workspaceVerifiedDomain={workspaceVerifiedDomain}
        />
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
          currentUserId={user.sId}
          owner={owner}
          searchTerm={searchTerm}
        />
        {popup}
      </Page.Vertical>
    </AppLayout>
  );
}

function DomainAutoJoinModal({
  domain,
  domainAutoJoinEnabled,
  isOpen,
  onClose,
  owner,
}: {
  domain: string;
  domainAutoJoinEnabled: boolean;
  isOpen: boolean;
  onClose: () => void;
  owner: WorkspaceType;
}) {
  const sendNotification = useSendNotification();

  const title = domainAutoJoinEnabled
    ? "De-activate Auto-join"
    : "Activate Auto-join";
  const validateLabel = domainAutoJoinEnabled ? "De-activate" : "Activate";
  const validateVariant = domainAutoJoinEnabled ? "warning" : "primary";
  const description = domainAutoJoinEnabled ? (
    "New members will need to be invited in order to gain access to your Dust Workspace."
  ) : (
    <span>
      Anyone with Google <span className="font-bold">{"@" + domain}</span>{" "}
      account will have access to your Dust Workspace.
    </span>
  );

  async function handleUpdateWorkspace(): Promise<void> {
    const res = await fetch(`/api/w/${owner.sId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        domain,
        domainAutoJoinEnabled: !domainAutoJoinEnabled,
      }),
    });

    if (!res.ok) {
      sendNotification({
        type: "error",
        title: "Update failed",
        description: `Failed to enable auto-add for whitelisted domain.`,
      });
    } else {
      // We perform a full refresh so that the Workspace name updates and we get a fresh owner
      // object so that the formValidation logic keeps working.
      window.location.reload();
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent size="md" isAlertDialog>
        <DialogHeader hideButton>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogContainer>{description}</DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: validateLabel,
            variant: validateVariant,
            onClick: async () => {
              await handleUpdateWorkspace();
              onClose();
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

const DEFAULT_PAGE_SIZE = 25;

function WorkspaceMembersList({
  currentUserId,
  owner,
  searchTerm,
}: {
  currentUserId: string;
  owner: WorkspaceType;
  searchTerm: string;
}) {
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
    <div className="flex flex-col gap-2">
      <Page.H variant="h5">Members</Page.H>
      <MembersList
        currentUserId={currentUserId}
        membersData={membersData}
        onRowClick={(user) => setSelectedMember(user)}
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
