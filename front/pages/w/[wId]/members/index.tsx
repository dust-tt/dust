import {
  Avatar,
  Button,
  Dialog,
  ElementModal,
  Page,
  PlusIcon,
  Popup,
  Searchbar,
} from "@dust-tt/sparkle";
import type {
  ActiveRoleType,
  UserType,
  UserTypeWithWorkspaces,
  WorkspaceDomain,
  WorkspaceType,
} from "@dust-tt/types";
import type {
  PlanType,
  SubscriptionPerSeatPricing,
  SubscriptionType,
} from "@dust-tt/types";
import { isActiveRoleType } from "@dust-tt/types";
import { UsersIcon } from "@heroicons/react/20/solid";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useContext, useMemo, useState } from "react";
import { useSWRConfig } from "swr";

import type { WorkspaceLimit } from "@app/components/app/ReachedLimitPopup";
import { ReachedLimitPopup } from "@app/components/app/ReachedLimitPopup";
import { InviteEmailModal } from "@app/components/members/InvitationModal";
import { InvitationsList } from "@app/components/members/InvitationsList";
import { MembersList } from "@app/components/members/MembersList";
import { ROLES_DATA } from "@app/components/members/Roles";
import { RoleDropDown } from "@app/components/members/RolesDropDown";
import { subNavigationAdmin } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import type { EnterpriseConnectionStrategyDetails } from "@app/components/workspace/connection";
import { EnterpriseConnectionDetails } from "@app/components/workspace/connection";
import config from "@app/lib/api/config";
import { makeEnterpriseConnectionInitiateLoginUrl } from "@app/lib/api/enterprise_connection";
import {
  checkWorkspaceSeatAvailabilityUsingAuth,
  getWorkspaceVerifiedDomain,
} from "@app/lib/api/workspace";
import { handleMembersRoleChange } from "@app/lib/client/members";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import { getPerSeatSubscriptionPricing } from "@app/lib/plans/subscription";
import { useMembers } from "@app/lib/swr";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withDefaultUserAuthRequirements<{
  user: UserType;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  perSeatPricing: SubscriptionPerSeatPricing | null;
  enterpriseConnectionStrategyDetails: EnterpriseConnectionStrategyDetails;
  plan: PlanType;
  gaTrackingId: string;
  workspaceHasAvailableSeats: boolean;
  workspaceVerifiedDomain: WorkspaceDomain | null;
}>(async (context, auth) => {
  const plan = auth.plan();
  const owner = auth.workspace();
  const user = auth.user();
  const subscription = auth.subscription();

  if (!owner || !user || !auth.isAdmin() || !plan || !subscription) {
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
      initiateLoginUrl: makeEnterpriseConnectionInitiateLoginUrl(owner.sId),
    };

  const perSeatPricing = await getPerSeatSubscriptionPricing(subscription);

  return {
    props: {
      user,
      owner,
      subscription,
      perSeatPricing,
      enterpriseConnectionStrategyDetails,
      plan,
      gaTrackingId: GA_TRACKING_ID,
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
  gaTrackingId,
  workspaceVerifiedDomain,
  workspaceHasAvailableSeats,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [showNoInviteLinkPopup, setShowNoInviteLinkPopup] = useState(false);
  const [isActivateAutoJoinOpened, setIsActivateAutoJoinOpened] =
    useState(false);

  const { domain = "", domainAutoJoinEnabled = false } =
    workspaceVerifiedDomain ?? {};

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      subNavigation={subNavigationAdmin({ owner, current: "members" })}
    >
      <div className="w-full max-w-4xl pt-8">
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
                Allow all your team members to access your Dust company
                Workspace when they authenticate with a{" "}
                <span className="font-bold">"@{domain}"</span> Google accounts.
              </Page.P>
              <div className="flex flex-col items-start gap-3">
                {domainAutoJoinEnabled ? (
                  <Button
                    label="De-activate Auto-join"
                    size="sm"
                    variant="secondaryWarning"
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
          />
          <MemberList perSeatPricing={perSeatPricing} />
        </Page.Vertical>
      </div>
    </AppLayout>
  );

  function MemberList({
    perSeatPricing,
  }: {
    perSeatPricing: SubscriptionPerSeatPricing | null;
  }) {
    const [inviteBlockedPopupReason, setInviteBlockedPopupReason] =
      useState<WorkspaceLimit | null>(null);

    const [searchText, setSearchText] = useState("");
    const { members, isMembersLoading } = useMembers(owner);

    const [inviteEmailModalOpen, setInviteEmailModalOpen] = useState(false);

    const [changeRoleMember, setChangeRoleMember] =
      useState<UserTypeWithWorkspaces | null>(null);

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
    }, [inviteBlockedPopupReason, setInviteBlockedPopupReason]);
    return (
      <>
        <InviteEmailModal
          showModal={inviteEmailModalOpen}
          onClose={() => {
            setInviteEmailModalOpen(false);
          }}
          owner={owner}
          prefillText={searchText}
          members={members}
          perSeatPricing={perSeatPricing}
        />
        <ChangeMemberModal
          owner={owner}
          member={changeRoleMember}
          onClose={() => setChangeRoleMember(null)}
        />
        <Page.Vertical gap="sm" align="stretch">
          <Page.H variant="h5">Member list</Page.H>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row">
            <div className="flex-grow">
              <Searchbar
                placeholder="Search members"
                onChange={setSearchText}
                value={searchText}
                name={""}
              />
            </div>
            <div className="relative flex-none">
              <Button
                variant="primary"
                label="Invite members"
                size="sm"
                icon={PlusIcon}
                onClick={() => {
                  if (!isUpgraded(plan)) {
                    setInviteBlockedPopupReason("cant_invite_free_plan");
                  } else if (subscription.paymentFailingSince) {
                    setInviteBlockedPopupReason("cant_invite_payment_failure");
                  } else if (!workspaceHasAvailableSeats) {
                    setInviteBlockedPopupReason(
                      "cant_invite_no_seats_available"
                    );
                  } else {
                    setInviteEmailModalOpen(true);
                  }
                }}
              />
              {popup}
            </div>
          </div>
          <div className="s-w-full">
            <div className="space-y-2 pt-4">
              <InvitationsList owner={owner} searchText={searchText} />
            </div>
            <div className="space-y-2 pb-3 pt-4">
              <Page.H variant="h5">Members</Page.H>
              <MembersList
                users={members}
                currentUserId={user.id}
                isMembersLoading={isMembersLoading}
                onClickEvent={(role) => setChangeRoleMember(role)}
                searchText={searchText}
              />
            </div>
          </div>
        </Page.Vertical>
      </>
    );
  }
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
  const sendNotification = useContext(SendNotificationsContext);

  const title = domainAutoJoinEnabled
    ? "De-activate Auto-join"
    : "Activate Auto-join";
  const validateLabel = domainAutoJoinEnabled ? "De-activate" : "Activate";
  const validateVariant = domainAutoJoinEnabled ? "primaryWarning" : "primary";
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
      isOpen={isOpen}
      title={title}
      onValidate={async () => {
        await handleUpdateWorkspace();
        onClose();
      }}
      onCancel={() => onClose()}
      validateLabel={validateLabel}
      validateVariant={validateVariant}
    >
      <div>{description}</div>
    </Dialog>
  );
}

function ChangeMemberModal({
  onClose,
  member,
  owner,
}: {
  onClose: () => void;
  member: UserTypeWithWorkspaces | null;
  owner: WorkspaceType;
}) {
  const { role = null } = member?.workspaces[0] ?? {};

  const { mutate } = useSWRConfig();
  const sendNotification = useContext(SendNotificationsContext);
  const [revokeMemberModalOpen, setRevokeMemberModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<ActiveRoleType | null>(
    role !== "none" ? role : null
  );
  const [isSaving, setIsSaving] = useState(false);

  if (!member || !role || !isActiveRoleType(role)) {
    return null;
  }

  return (
    <ElementModal
      openOnElement={member}
      onClose={() => {
        onClose();
        setSelectedRole(null);
        setIsSaving(false);
      }}
      isSaving={isSaving}
      hasChanged={selectedRole !== member.workspaces[0].role}
      title={member.fullName || "Unreachable"}
      variant="side-sm"
      onSave={async (closeModalFn: () => void) => {
        if (!selectedRole) {
          return;
        }
        setIsSaving(true);
        await handleMembersRoleChange({
          members: [member],
          role: selectedRole,
          sendNotification,
        });
        await mutate(`/api/w/${owner.sId}/members`);
        closeModalFn();
      }}
      saveLabel="Update role"
    >
      <Page variant="modal">
        <div className="mt-6 flex flex-col gap-9 text-sm text-element-700">
          <div className="flex items-center gap-4">
            <Avatar size="lg" visual={member.image} name={member.fullName} />
            <div className="flex grow flex-col">
              <div className="font-semibold text-element-900">
                {member.fullName}
              </div>
              <div className="font-normal">{member.email}</div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="font-bold text-element-900">Role:</div>
              <RoleDropDown
                selectedRole={selectedRole || role}
                onChange={setSelectedRole}
              />
            </div>
            <Page.P>
              The role defines the rights of a member of the workspace.{" "}
              {ROLES_DATA[role]["description"]}
            </Page.P>
          </div>
          <div className="flex flex-none flex-col gap-2">
            <div className="flex-none">
              <Button
                variant="primaryWarning"
                label="Revoke member access"
                size="sm"
                onClick={() => setRevokeMemberModalOpen(true)}
              />
            </div>
            <Page.P>
              Deleting a member will remove them from the workspace. They will
              be able to rejoin if they have an invitation link.
            </Page.P>
          </div>
        </div>
      </Page>
      <Dialog
        isOpen={revokeMemberModalOpen}
        title="Revoke member access"
        onValidate={async () => {
          await handleMembersRoleChange({
            members: [member],
            role: "none",
            sendNotification,
          });
          await mutate(`/api/w/${owner.sId}/members`);
          setRevokeMemberModalOpen(false);
          onClose();
        }}
        validateLabel="Yes, revoke"
        validateVariant="primaryWarning"
        onCancel={() => {
          setRevokeMemberModalOpen(false);
        }}
        isSaving={isSaving}
      >
        <div>
          Revoke access for user{" "}
          <span className="font-bold">{member.fullName}</span>?
        </div>
      </Dialog>
    </ElementModal>
  );
}
