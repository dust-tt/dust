import {
  Button,
  ContentMessage,
  ElementModal,
  Modal,
  MovingMailIcon,
  Page,
  TextArea,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type {
  ActiveRoleType,
  MembershipInvitationType,
  RoleType,
  SubscriptionPerSeatPricing,
  WorkspaceType,
} from "@dust-tt/types";
import { useContext, useEffect, useState } from "react";
import { mutate } from "swr";

import type { ConfirmDataType } from "@app/components/Confirm";
import { ConfirmContext } from "@app/components/Confirm";
import { displayRole, ROLES_DATA } from "@app/components/members/Roles";
import { RoleDropDown } from "@app/components/members/RolesDropDown";
import type { NotificationType } from "@app/components/sparkle/Notification";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { handleMembersRoleChange } from "@app/lib/client/members";
import { getPriceAsString } from "@app/lib/client/subscription";
import { MAX_UNCONSUMED_INVITATIONS_PER_WORKSPACE_PER_DAY } from "@app/lib/invitations";
import { isEmailValid } from "@app/lib/utils";
import type {
  PostInvitationRequestBody,
  PostInvitationResponseBody,
} from "@app/pages/api/w/[wId]/invitations";

export function InviteEmailModal({
  showModal,
  onClose,
  owner,
  prefillText,
  perSeatPricing,
}: {
  showModal: boolean;
  onClose: () => void;
  owner: WorkspaceType;
  prefillText: string;
  perSeatPricing: SubscriptionPerSeatPricing | null;
}) {
  const [inviteEmails, setInviteEmails] = useState<string>("");
  const [isSending, setIsSending] = useState(false);
  const [emailError, setEmailError] = useState("");

  const sendNotification = useContext(SendNotificationsContext);
  const confirm = useContext(ConfirmContext);
  const [invitationRole, setInvitationRole] = useState<ActiveRoleType>("user");

  function getEmailsList(): string[] | null {
    const inviteEmailsList = inviteEmails
      .split(/[\n,]+/)
      .map((e) => e.trim())
      .filter((e) => e !== "")
      // remove duplicates
      .filter((e, i, self) => self.indexOf(e) === i);
    if (inviteEmailsList.map(isEmailValid).includes(false)) {
      setEmailError(
        "Invalid email addresses: " +
          inviteEmailsList.filter((e) => !isEmailValid(e)).join(", ")
      );
      return null;
    }
    return inviteEmailsList;
  }

  async function handleSendInvitations(
    inviteEmailsList: string[]
  ): Promise<void> {
    if (
      inviteEmailsList.length > MAX_UNCONSUMED_INVITATIONS_PER_WORKSPACE_PER_DAY
    ) {
      sendNotification({
        type: "error",
        title: "Too many invitations",
        description: `Your cannot send more than ${MAX_UNCONSUMED_INVITATIONS_PER_WORKSPACE_PER_DAY} invitations per day.`,
      });
      return;
    }

    const existingMembersResponses = await Promise.all(
      inviteEmailsList.map(async (email) => {
        const response = await fetch(
          `/api/w/${owner.sId}/members/search?searchTerm=${encodeURIComponent(email)}&orderBy=name`
        );
        if (!response.ok) {
          throw new Error("Failed to fetch member information");
        }
        return response.json();
      })
    );
    const existingMembers = existingMembersResponses.flatMap(
      (response) => response.members
    );

    const invitesByCase = {
      activeSameRole: existingMembers.filter(
        (m) => m && m.role === invitationRole
      ),
      activeDifferentRole: existingMembers.filter(
        (m) => m && m.role !== invitationRole && m.role !== "none"
      ),
      notInWorkspace: inviteEmailsList.filter(
        (_, index) =>
          !existingMembers[index] || existingMembers[index].role === "none"
      ),
    };

    const { notInWorkspace, activeDifferentRole } = invitesByCase;

    const ReinviteUsersMessage = (
      <div className="mt-6 flex flex-col gap-6 px-2">
        {activeDifferentRole.length > 0 && (
          <div>
            <div>
              The user(s) below are already in your workspace with a different
              role. Moving forward will change their role to{" "}
              <span className="font-bold">{displayRole(invitationRole)}</span>.
            </div>
            <div className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto rounded border p-2 text-xs">
              {activeDifferentRole.map((user) => (
                <div key={user.email}>{`- ${
                  user.fullName
                } (current role: ${displayRole(user.workspaces[0].role)})`}</div>
              ))}
            </div>
          </div>
        )}

        <div>Do you want to proceed?</div>
      </div>
    );

    const hasExistingMembers = activeDifferentRole.length > 0;

    const shouldProceedWithInvites =
      !hasExistingMembers ||
      (await confirm({
        title: "Some users are already in the workspace",
        message: ReinviteUsersMessage,
        validateLabel: "Yes, proceed",
        validateVariant: "primaryWarning",
      }));

    if (shouldProceedWithInvites) {
      await sendInvitations({
        owner,
        emails: notInWorkspace,
        invitationRole,
        sendNotification,
        isNewInvitation: true,
      });

      if (hasExistingMembers) {
        await handleMembersRoleChange({
          members: activeDifferentRole,
          role: invitationRole,
          sendNotification,
        });
        await mutate(`/api/w/${owner.sId}/members`);
      }
      await mutate(`/api/w/${owner.sId}/invitations`);
      onClose();
    }
  }

  useEffect(() => {
    if (showModal && prefillText && isEmailValid(prefillText)) {
      setInviteEmails((prev) => {
        if (prev.includes(prefillText)) {
          return prev;
        }
        return prev ? prev + ", " + prefillText : prefillText;
      });
    }
  }, [prefillText, showModal]);

  return (
    <>
      <Modal
        isOpen={showModal}
        onClose={onClose}
        hasChanged={emailError === "" && inviteEmails !== "" && !isSending}
        title="Invite new users"
        variant="side-sm"
        saveLabel="Invite"
        isSaving={isSending}
        onSave={async () => {
          const inviteEmailsList = getEmailsList();
          if (!inviteEmailsList) {
            return;
          }
          setIsSending(true);
          await handleSendInvitations(inviteEmailsList);
          setIsSending(false);
          setInviteEmails("");
        }}
        className="flex"
      >
        <div className="mt-6 flex grow flex-col gap-6 px-2 text-sm">
          <div className="flex flex-grow flex-col gap-5">
            <div className="font-semibold">
              Email addresses (comma or newline separated):
            </div>
            <div className="flex items-start gap-2">
              <div className="flex-grow">
                <TextArea
                  placeholder="Email addresses, comma or newline separated"
                  value={inviteEmails}
                  onChange={(value) => {
                    setInviteEmails(value);
                    setEmailError("");
                  }}
                  error={emailError}
                  showErrorLabel={true}
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
          {perSeatPricing !== null && (
            <div className="justify-self-end">
              <ProPlanBillingNotice perSeatPricing={perSeatPricing} />
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

export function EditInvitationModal({
  owner,
  invitation,
  onClose,
}: {
  owner: WorkspaceType;
  invitation: MembershipInvitationType;
  onClose: () => void;
}) {
  const [selectedRole, setSelectedRole] = useState<ActiveRoleType>(
    invitation.initialRole
  );
  const sendNotification = useContext(SendNotificationsContext);
  const confirm = useContext(ConfirmContext);

  return (
    <ElementModal
      title="Edit invitation"
      openOnElement={invitation}
      onClose={() => {
        onClose();
        setSelectedRole(invitation.initialRole);
      }}
      hasChanged={selectedRole !== invitation.initialRole}
      variant="side-sm"
      onSave={async (closeModalFn) => {
        await updateInvitation({
          owner,
          invitation,
          newRole: selectedRole,
          sendNotification,
          confirm,
        });
        closeModalFn();
      }}
      saveLabel="Update role"
    >
      <Page variant="modal">
        <Page.Layout direction="vertical">
          <Page.Layout direction="horizontal" sizing="grow" gap="sm">
            <Page.H variant="h6">{invitation.inviteEmail}</Page.H>
          </Page.Layout>
          <div className="grow font-normal text-element-700">
            Invitation sent on{" "}
            {new Date(invitation.createdAt).toLocaleDateString()}
          </div>
          <div className="flex items-center gap-2">
            <div className="font-semibold text-element-900">Role:</div>
            <RoleDropDown
              selectedRole={selectedRole}
              onChange={setSelectedRole}
            />
          </div>
          <div className="grow font-normal text-element-700">
            The role defines the rights of a member fo the workspace.{" "}
            {ROLES_DATA[invitation.initialRole].description}
          </div>
          <div className="flex items-center gap-2">
            <Button
              className="mt-4"
              variant="primary"
              label="Send invitation again"
              icon={MovingMailIcon}
              onClick={async () => {
                await sendInvitations({
                  owner,
                  emails: [invitation.inviteEmail],
                  invitationRole: selectedRole,
                  sendNotification,
                  isNewInvitation: false,
                });
              }}
            />
            <Button
              className="mt-4"
              variant="primaryWarning"
              label="Revoke invitation"
              icon={XMarkIcon}
              disabled={owner.ssoEnforced}
              onClick={async () => {
                await updateInvitation({
                  invitation,
                  owner,
                  sendNotification,
                  confirm,
                });
              }}
            />
          </div>
        </Page.Layout>
      </Page>
    </ElementModal>
  );
}

function ProPlanBillingNotice({
  perSeatPricing,
}: {
  perSeatPricing: SubscriptionPerSeatPricing;
}) {
  return (
    <ContentMessage size="md" variant="amber" title="Note">
      <p>
        New users will be charged a{" "}
        <span className="font-semibold">
          {perSeatPricing.billingPeriod} fee of{" "}
          {getPriceAsString({
            currency: perSeatPricing.seatCurrency,
            priceInCents: perSeatPricing.seatPrice,
          })}
        </span>
        .{" "}
      </p>
      <br />
      <p>
        Next bill will be adjusted proportionally based on the members' sign-up
        date.
      </p>
    </ContentMessage>
  );
}

async function sendInvitations({
  owner,
  emails,
  invitationRole,
  sendNotification,
  isNewInvitation,
}: {
  owner: WorkspaceType;
  emails: string[];
  invitationRole: ActiveRoleType;
  sendNotification: any;
  isNewInvitation: boolean;
}) {
  const body: PostInvitationRequestBody = emails.map((email) => ({
    email,
    role: invitationRole,
  }));

  const res = await fetch(`/api/w/${owner.sId}/invitations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let data: any = {};
    try {
      data = await res.json();
    } catch (e) {
      // ignore
    }
    if (data?.error?.type === "invitation_already_sent_recently") {
      sendNotification({
        type: "error",
        title: emails.length === 1 ? "Invite failed" : "Invites failed",
        description:
          (emails.length === 1 ? "This user has" : "These users have") +
          " already been invited in the last 24 hours. Please wait before sending another invite.",
      });
    }

    sendNotification({
      type: "error",
      title: "Invite failed",
      description:
        "Failed to invite new members to workspace: " + res.statusText,
    });
  } else {
    const result: PostInvitationResponseBody = await res.json();
    const failures = result.filter((r) => !r.success);

    if (failures.length > 0) {
      sendNotification({
        type: "error",
        title: "Some invites failed",
        description:
          result[0].error_message ||
          `Failed to invite ${failures} new member(s) to workspace.`,
      });
    } else {
      sendNotification({
        type: "success",
        title: "Invites sent",
        description: isNewInvitation
          ? `${emails.length} new invites sent.`
          : `Sent ${emails.length} invites again.`,
      });
    }
  }
}

async function updateInvitation({
  owner,
  invitation,
  newRole,
  sendNotification,
  confirm,
}: {
  owner: WorkspaceType;
  invitation: MembershipInvitationType;
  newRole?: RoleType; // Optional parameter for role change
  sendNotification: (notificationData: NotificationType) => void;
  confirm?: (confirmData: ConfirmDataType) => Promise<boolean>;
}) {
  if (!newRole && confirm) {
    const confirmation = await confirm({
      title: "Revoke invitation",
      message: `Are you sure you want to revoke the invitation for ${invitation.inviteEmail}?`,
      validateLabel: "Yes, revoke",
      validateVariant: "primaryWarning",
    });
    if (!confirmation) {
      return;
    }
  }

  const body = {
    status: newRole ? invitation.status : "revoked",
    initialRole: newRole ?? invitation.initialRole,
  };

  const res = await fetch(`/api/w/${owner.sId}/invitations/${invitation.sId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const error: { error: { message: string } } = await res.json();
    const message = newRole
      ? error.error.message
      : "Failed to update member's invitation.";
    sendNotification({
      type: "error",
      title: `${newRole ? "Role Update Failed" : "Revoke Failed"}`,
      description: message,
    });
    return;
  }

  const successMessage = newRole
    ? `Invitation updated to ${newRole}`
    : "Invitation revoked";
  sendNotification({
    type: "success",
    title: `${newRole ? "Role updated" : "Invitation Revoked"}`,
    description: `${successMessage} for ${invitation.inviteEmail}.`,
  });
  await mutate(`/api/w/${owner.sId}/invitations`);
}
