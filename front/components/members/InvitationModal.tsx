import { ContentMessage, Modal, TextArea } from "@dust-tt/sparkle";
import type {
  ActiveRoleType,
  SubscriptionPerSeatPricing,
  WorkspaceType,
} from "@dust-tt/types";
import { useContext, useEffect, useState } from "react";
import { mutate } from "swr";

import { ConfirmContext } from "@app/components/Confirm";
import { displayRole, ROLES_DATA } from "@app/components/members/Roles";
import { RoleDropDown } from "@app/components/members/RolesDropDown";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { useChangeMembersRoles } from "@app/hooks/useChangeMembersRoles";
import { getPriceAsString } from "@app/lib/client/subscription";
import {
  MAX_UNCONSUMED_INVITATIONS_PER_WORKSPACE_PER_DAY,
  sendInvitations,
} from "@app/lib/invitations";
import { isEmailValid } from "@app/lib/utils";

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
  const handleMembersRoleChange = useChangeMembersRoles({ owner });

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
        (m) => m && m.workspaces[0].role === invitationRole
      ),
      activeDifferentRole: existingMembers.filter(
        (m) =>
          m &&
          m.workspaces[0].role !== invitationRole &&
          m.workspaces[0].role !== "none"
      ),
      notInWorkspace: inviteEmailsList.filter(
        (m) =>
          !existingMembers.find((x) => x.email === m) ||
          existingMembers.find((x) => x.email === m)?.workspaces[0].role ===
            "none"
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
                  onChange={(e) => {
                    setInviteEmails(e.target.value);
                    setEmailError("");
                  }}
                  error={emailError}
                  showErrorLabel
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
