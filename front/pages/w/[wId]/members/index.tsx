import {
  Avatar,
  Button,
  ChevronDownIcon,
  ChevronRightIcon,
  Chip,
  Dialog,
  DropdownMenu,
  ElementModal,
  Icon,
  IconButton,
  Input,
  Modal,
  Page,
  PlusIcon,
  Popup,
  Searchbar,
} from "@dust-tt/sparkle";
import type { MembershipInvitationType } from "@dust-tt/types";
import type { PlanType, SubscriptionType } from "@dust-tt/types";
import type {
  ActiveRoleType,
  RoleType,
  UserType,
  UserTypeWithWorkspaces,
  WorkspaceDomain,
  WorkspaceType,
} from "@dust-tt/types";
import { ACTIVE_ROLES } from "@dust-tt/types";
import { UsersIcon } from "@heroicons/react/20/solid";
import assert from "assert";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useContext, useMemo, useState } from "react";
import { useSWRConfig } from "swr";

import type { WorkspaceLimit } from "@app/components/app/ReachedLimitPopup";
import { ReachedLimitPopup } from "@app/components/app/ReachedLimitPopup";
import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import type { EnterpriseConnectionStrategyDetails } from "@app/components/workspace/connection";
import { EnterpriseConnectionDetails } from "@app/components/workspace/connection";
import config from "@app/lib/api/config";
import { makeEnterpriseConnectionInitiateLoginUrl } from "@app/lib/api/enterprise_connection";
import {
  checkWorkspaceSeatAvailabilityUsingAuth,
  getWorkspaceVerifiedDomain,
} from "@app/lib/api/workspace";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import { useMembers, useWorkspaceInvitations } from "@app/lib/swr";
import { classNames, isEmailValid } from "@app/lib/utils";
import type {
  PostInvitationRequestBody,
  PostInvitationResponseBody,
} from "@app/pages/api/w/[wId]/invitations";

const { GA_TRACKING_ID = "" } = process.env;

const CLOSING_ANIMATION_DURATION = 200;

export const getServerSideProps = withDefaultUserAuthRequirements<{
  user: UserType;
  owner: WorkspaceType;
  subscription: SubscriptionType;
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
      strategy: "okta",
    };

  return {
    props: {
      user,
      owner,
      subscription,
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
      topNavigationCurrent="admin"
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
        <MemberList />
      </Page.Vertical>
    </AppLayout>
  );

  function MemberList() {
    const [inviteBlockedPopupReason, setInviteBlockedPopupReason] =
      useState<WorkspaceLimit | null>(null);

    const [searchText, setSearchText] = useState("");
    const { members, isMembersLoading } = useMembers(owner);
    const { invitations, isInvitationsLoading } =
      useWorkspaceInvitations(owner);
    const [inviteEmailModalOpen, setInviteEmailModalOpen] = useState(false);

    const [changeRoleMember, setChangeRoleMember] =
      useState<UserTypeWithWorkspaces | null>(null);
    const [invitationToRevoke, setInvitationToRevoke] =
      useState<MembershipInvitationType | null>(null);

    function isInvitation(
      arg: MembershipInvitationType | UserType
    ): arg is MembershipInvitationType {
      return (arg as MembershipInvitationType).inviteEmail !== undefined;
    }

    const displayedMembersAndInvitations: (
      | UserTypeWithWorkspaces
      | MembershipInvitationType
    )[] = [
      ...members
        .sort((a, b) => a.fullName.localeCompare(b.fullName))
        .filter((m) => m.workspaces[0].role !== "none")
        .filter(
          (m) =>
            !searchText ||
            m.fullName.toLowerCase().includes(searchText.toLowerCase()) ||
            m.email?.toLowerCase().includes(searchText.toLowerCase()) ||
            m.username?.toLowerCase().includes(searchText.toLowerCase())
        ),
      ...invitations
        .sort((a, b) => a.inviteEmail.localeCompare(b.inviteEmail))
        .filter((i) => i.status === "pending")
        .filter(
          (i) =>
            !searchText ||
            i.inviteEmail.toLowerCase().includes(searchText.toLowerCase())
        ),
    ];

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
          members={members}
        />
        <RevokeInvitationModal
          invitation={invitationToRevoke}
          onClose={() => setInvitationToRevoke(null)}
          owner={owner}
        />
        <ChangeMemberModal
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
            {displayedMembersAndInvitations.map(
              (item: UserTypeWithWorkspaces | MembershipInvitationType) => {
                const role = isInvitation(item)
                  ? item.initialRole
                  : item.workspaces[0].role;
                assert(
                  role !== "none",
                  "Unreachable (typescript pleasing): role cannot be none"
                );
                return (
                  <div
                    key={
                      isInvitation(item)
                        ? `invitation-${item.id}`
                        : `member-${item.id}`
                    }
                    className="transition-color flex cursor-pointer items-center justify-center gap-3 border-t border-structure-200 p-2 text-xs duration-200 hover:bg-action-50 sm:text-sm"
                    onClick={() => {
                      if (user.id === item.id) return; // no action on self
                      if (isInvitation(item)) setInvitationToRevoke(item);
                      else setChangeRoleMember(item);
                    }}
                  >
                    <div className="hidden sm:block">
                      {isInvitation(item) ? (
                        <Avatar size="sm" />
                      ) : (
                        <Avatar
                          visual={item.image}
                          name={item.fullName}
                          size="sm"
                        />
                      )}
                    </div>
                    <div className="flex grow flex-col gap-1 sm:flex-row sm:gap-3">
                      {!isInvitation(item) && (
                        <div className="font-medium text-element-900">
                          {item.fullName}
                          {user.id === item.id && " (you)"}
                        </div>
                      )}

                      <div className="grow font-normal text-element-700">
                        {isInvitation(item)
                          ? item.inviteEmail
                          : item.email || item.username}
                      </div>
                    </div>
                    {isInvitation(item) && (
                      <div>
                        <Chip size="xs" color="slate">
                          Invitation {item.status}
                        </Chip>
                      </div>
                    )}
                    <div>
                      <Chip
                        size="xs"
                        color={ROLES_DATA[role]["color"]}
                        className="capitalize"
                      >
                        {displayRole(role)}
                      </Chip>
                    </div>
                    <div className="hidden sm:block">
                      <Icon
                        visual={ChevronRightIcon}
                        className={classNames(
                          "text-element-600",
                          user.id === item.id ? "invisible" : ""
                        )}
                      />
                    </div>
                  </div>
                );
              }
            )}
            {(isMembersLoading || isInvitationsLoading) && (
              <div className="flex animate-pulse cursor-pointer items-center justify-center gap-3 border-t border-structure-200 bg-structure-50 py-2 text-xs sm:text-sm">
                <div className="hidden sm:block">
                  <Avatar size="xs" />
                </div>
                <div className="flex grow flex-col gap-1 sm:flex-row sm:gap-3">
                  <div className="font-medium text-element-900">Loading...</div>
                  <div className="grow font-normal text-element-700"></div>
                </div>
                <div>
                  <Chip size="xs" color="slate">
                    Loading...
                  </Chip>
                </div>
                <div className="hidden sm:block">
                  <ChevronRightIcon />
                </div>
              </div>
            )}
          </div>
        </Page.Vertical>
      </>
    );
  }
}

function InviteEmailModal({
  showModal,
  onClose,
  owner,
  members,
}: {
  showModal: boolean;
  onClose: () => void;
  owner: WorkspaceType;
  members: UserTypeWithWorkspaces[];
}) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [emailError, setEmailError] = useState("");
  // when set, the modal to reinvite a user that was revoked will be shown
  const [existingRevokedUser, setExistingRevokedUser] =
    useState<UserTypeWithWorkspaces | null>(null);
  const { mutate } = useSWRConfig();
  const [invitationRole, setInvitationRole] = useState<ActiveRoleType>("user");
  const sendNotification = useContext(SendNotificationsContext);
  async function handleSendInvitation(): Promise<void> {
    if (!isEmailValid(inviteEmail)) {
      setEmailError("Invalid email address.");
      return;
    }
    const existing = members.find((m) => m.email === inviteEmail);
    if (existing) {
      if (existing.workspaces[0].role !== "none") {
        setEmailError("User is already a member of this workspace.");
      } else {
        setExistingRevokedUser(existing);
      }
      return;
    }

    const body: PostInvitationRequestBody = [
      {
        email: inviteEmail,
        role: invitationRole,
      },
    ];

    const res = await fetch(`/api/w/${owner.sId}/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      sendNotification({
        type: "error",
        title: "Invite failed",
        description:
          "Failed to invite new member to workspace: " + res.statusText,
      });
    } else {
      const result: PostInvitationResponseBody = await res.json();
      if (result[0].success === false) {
        sendNotification({
          type: "error",
          title: "Invite failed",
          description:
            result[0].error_message ||
            "Failed to invite new member to workspace.",
        });
      } else {
        sendNotification({
          type: "success",
          title: "Invite sent",
          description: `Invite sent to ${inviteEmail}. You can repeat the operation to invite other users.`,
        });
        await mutate(`/api/w/${owner.sId}/invitations`);
      }
    }
  }

  return (
    <>
      <ReinviteUserModal
        onClose={() => setExistingRevokedUser(null)}
        user={existingRevokedUser}
        role={invitationRole}
      />
      <Modal
        isOpen={showModal}
        onClose={onClose}
        hasChanged={emailError === "" && inviteEmail !== "" && !isSending}
        title="Invite new users"
        variant="side-sm"
        saveLabel="Invite"
        isSaving={isSending}
        onSave={async () => {
          setIsSending(true);
          await handleSendInvitation();
          setIsSending(false);
          setInviteEmail("");
        }}
      >
        <div className="mt-6 flex flex-col gap-6 px-2 text-sm">
          <Page.P>
            Invite a new user to your workspace. They will receive an email with
            a link to join your workspace.
          </Page.P>
          <div className="flex flex-grow flex-col gap-1.5">
            <div className="font-semibold">Email to send invite to:</div>
            <div className="flex items-start gap-2">
              <div className="flex-grow">
                <Input
                  placeholder={"Email address"}
                  value={inviteEmail || ""}
                  name={""}
                  error={emailError}
                  showErrorLabel={true}
                  onChange={(e) => {
                    setInviteEmail(e.trim());
                    setEmailError("");
                  }}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="font-semibold text-element-900">Role:</div>
                <RoleDropDown
                  selectedRole={invitationRole}
                  onChange={setInvitationRole}
                />
              </div>
            </div>
            <div className="text-element-700">
              {ROLES_DATA[invitationRole]["description"]}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}

function ReinviteUserModal({
  onClose,
  user,
  role,
}: {
  onClose: (show: boolean) => void;
  user: UserTypeWithWorkspaces | null;
  role: ActiveRoleType;
}) {
  const { mutate } = useSWRConfig();
  const sendNotification = useContext(SendNotificationsContext);
  const [isSaving, setIsSaving] = useState(false);
  if (!user) return null;
  return (
    <Modal
      isOpen={!!user}
      onClose={() => onClose(false)}
      hasChanged={false}
      title="Reinstate user?"
      variant="dialogue"
    >
      <div className="mt-6 flex flex-col gap-6 px-2">
        <div>
          {" "}
          <span className="font-semibold">{user.email + " "}</span> was revoked
          from the workspace. Reinstating them as member will also immediately
          reinstate their conversation history on Dust.
        </div>
        <div className="flex gap-2">
          <Button
            variant="tertiary"
            label="Cancel"
            onClick={() => onClose(false)}
          />
          <Button
            variant="primaryWarning"
            label={isSaving ? "Reinstating..." : "Yes, reinstate"}
            onClick={async () => {
              setIsSaving(true);
              await handleMemberRoleChange({
                member: user,
                role,
                mutate,
                sendNotification,
              });
              onClose(false);
              /* Delay to let react close the modal before cleaning isSaving, to
               * avoid the user seeing the button change label again during the closing animation */
              setTimeout(() => {
                setIsSaving(false);
              }, CLOSING_ANIMATION_DURATION);
            }}
          />
        </div>
      </div>
    </Modal>
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

function RevokeInvitationModal({
  onClose,
  invitation,
  owner,
}: {
  onClose: () => void;
  invitation: MembershipInvitationType | null;
  owner: WorkspaceType;
}) {
  const { mutate } = useSWRConfig();
  const [isSaving, setIsSaving] = useState(false);
  const sendNotification = useContext(SendNotificationsContext);
  if (!invitation) return null;

  async function handleRevokeInvitation(
    invitation: MembershipInvitationType
  ): Promise<void> {
    const res = await fetch(
      `/api/w/${owner.sId}/invitations/${invitation.id}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "revoked",
        }),
      }
    );
    if (!res.ok) {
      sendNotification({
        type: "error",
        title: "Revoke failed",
        description: "Failed to revoke member's invitation.",
      });
    } else {
      sendNotification({
        type: "success",
        title: "Invitation revoked",
        description: `Invitation revoked for ${invitation.inviteEmail}.`,
      });
      await mutate(`/api/w/${owner.sId}/invitations`);
    }
  }

  return (
    <ElementModal
      openOnElement={invitation}
      onClose={onClose}
      hasChanged={false}
      title="Revoke invitation"
      isSaving={isSaving}
      variant="dialogue"
    >
      <div className="mt-6 flex flex-col gap-6 px-2">
        <div>
          Revoke invitation for user with email{" "}
          <span className="font-bold">{invitation?.inviteEmail}</span>?
        </div>
        <div className="flex gap-2">
          <Button variant="tertiary" label="Cancel" onClick={onClose} />
          <Button
            variant="primaryWarning"
            label={isSaving ? "Revoking..." : "Yes, revoke"}
            onClick={async () => {
              setIsSaving(true);
              await handleRevokeInvitation(invitation);
              onClose();
              /* Delay to let react close the modal before cleaning isSaving, to
               * avoid the user seeing the button change label again during the closing animation */
              setTimeout(() => {
                setIsSaving(false);
              }, CLOSING_ANIMATION_DURATION);
            }}
          />
        </div>
      </div>
    </ElementModal>
  );
}

async function handleMemberRoleChange({
  member,
  role,
  mutate,
  sendNotification,
}: {
  member: UserTypeWithWorkspaces;
  role: RoleType;
  mutate: any;
  sendNotification: any;
}): Promise<void> {
  const res = await fetch(
    `/api/w/${member.workspaces[0].sId}/members/${member.id}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        role: role === "none" ? "revoked" : role,
      }),
    }
  );
  if (!res.ok) {
    sendNotification({
      type: "error",
      title: "Update failed",
      description: "Failed to update member's role.",
    });
  } else {
    sendNotification({
      type: "success",
      title: "Role updated",
      description: `Role updated to ${role} for ${member.fullName}.`,
    });
    await mutate(`/api/w/${member.workspaces[0].sId}/members`);
  }
}

function ChangeMemberModal({
  onClose,
  member,
}: {
  onClose: () => void;
  member: UserTypeWithWorkspaces | null;
}) {
  assert(
    member?.workspaces[0].role !== "none",
    "Unreachable (typescript pleasing): member role cannot be none"
  );
  const { mutate } = useSWRConfig();
  const sendNotification = useContext(SendNotificationsContext);
  const [revokeMemberModalOpen, setRevokeMemberModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<ActiveRoleType | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!member) return null;

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
        await handleMemberRoleChange({
          member,
          role: selectedRole,
          mutate,
          sendNotification,
        });
        closeModalFn();
      }}
      saveLabel="Update role"
    >
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
              selectedRole={selectedRole || member.workspaces[0].role}
              onChange={setSelectedRole}
            />
          </div>
          <Page.P>
            The role defines the rights of a member of the workspace.{" "}
            {ROLES_DATA[member.workspaces[0].role]["description"]}
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
            Deleting a member will remove them from the workspace. They will be
            able to rejoin if they have an invitation link.
          </Page.P>
        </div>
      </div>
      <Modal
        onClose={() => setRevokeMemberModalOpen(false)}
        isOpen={revokeMemberModalOpen}
        title="Revoke member access"
        hasChanged={false}
        variant="dialogue"
      >
        <div className="mt-6 flex flex-col gap-6 px-2">
          <div>
            Revoke access for user{" "}
            <span className="font-bold">{member.fullName}</span>?
          </div>
          <div className="flex gap-2">
            <Button
              variant="tertiary"
              label="Cancel"
              onClick={() => setRevokeMemberModalOpen(false)}
            />
            <Button
              variant="primaryWarning"
              label={isSaving ? "Revoking..." : "Yes, revoke"}
              onClick={async () => {
                setIsSaving(true);
                await handleMemberRoleChange({
                  member,
                  role: "none",
                  mutate,
                  sendNotification,
                });
                setRevokeMemberModalOpen(false);
                onClose();
                /* Delay to let react close the modal before cleaning isSaving, to
                 * avoid the user seeing the button change label again during the closing animation */
                setTimeout(() => {
                  setIsSaving(false);
                }, CLOSING_ANIMATION_DURATION);
              }}
            />
          </div>
        </div>
      </Modal>
    </ElementModal>
  );
}

function displayRole(role: RoleType): string {
  return role === "user" ? "member" : role;
}

function RoleDropDown({
  selectedRole,
  onChange,
}: {
  selectedRole: ActiveRoleType;
  onChange: (role: ActiveRoleType) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenu.Button>
        <div className="group flex cursor-pointer items-center gap-2">
          <Chip
            color={ROLES_DATA[selectedRole]["color"]}
            className="capitalize"
          >
            {displayRole(selectedRole)}
          </Chip>
          <IconButton
            icon={ChevronDownIcon}
            size="sm"
            variant="secondary"
            className="group-hover:text-action-400"
          />
        </div>
      </DropdownMenu.Button>
      <DropdownMenu.Items origin="topLeft">
        {ACTIVE_ROLES.map((role) => (
          <DropdownMenu.Item
            key={role}
            onClick={() => onChange(role)}
            label={
              displayRole(role).charAt(0).toUpperCase() +
              displayRole(role).slice(1)
            }
          />
        ))}
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}

const ROLES_DATA: Record<
  ActiveRoleType,
  { description: string; color: "red" | "amber" | "emerald" | "slate" }
> = {
  admin: {
    description: "Admins can manage members, in addition to builders' rights.",
    color: "red",
  },
  builder: {
    description:
      "Builders can create custom assistants and use advanced dev tools.",
    color: "amber",
  },
  user: {
    description:
      "Members can use assistants provided by Dust as well as custom assistants created by their company.",
    color: "emerald",
  },
};
