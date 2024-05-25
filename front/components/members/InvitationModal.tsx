import {
  Button,
  ContentMessage,
  Modal,
  MovingMailIcon,
  Page,
  TextArea,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type {
  ActiveRoleType,
  MembershipInvitationType,
  PlanType,
  RoleType,
  UserTypeWithWorkspaces,
  WorkspaceType,
} from "@dust-tt/types";
import { useContext, useState } from "react";
import { mutate, useSWRConfig } from "swr";

import type { ConfirmDataType } from "@app/components/Confirm";
import { ConfirmContext } from "@app/components/Confirm";
import { displayRole, ROLES_DATA } from "@app/components/members/Roles";
import { RoleDropDown } from "@app/components/members/RolesDropDown";
import type { NotificationType } from "@app/components/sparkle/Notification";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { handleMembersRoleChange } from "@app/lib/client/members";
import {
  getPriceWithCurrency,
  PRO_PLAN_29_COST,
} from "@app/lib/client/subscription";
import { MAX_UNCONSUMED_INVITATIONS_PER_WORKSPACE_PER_DAY } from "@app/lib/invitations";
import { isProPlanCode } from "@app/lib/plans/plan_codes";
import { isEmailValid } from "@app/lib/utils";
import type {
  PostInvitationRequestBody,
  PostInvitationResponseBody,
} from "@app/pages/api/w/[wId]/invitations";

export function InviteEmailModal({
  showModal,
  onClose,
  owner,
  plan,
  members,
}: {
  showModal: boolean;
  onClose: () => void;
  owner: WorkspaceType;
  plan: PlanType;
  members: UserTypeWithWorkspaces[];
}) {
  const [inviteEmails, setInviteEmails] = useState<string>("");
  const [isSending, setIsSending] = useState(false);
  const [emailError, setEmailError] = useState("");
  const { mutate } = useSWRConfig();
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

    const invitesByCase = {
      activeSameRole: members.filter((m) =>
        inviteEmailsList.find(
          (e) => m.email === e && m.workspaces[0].role === invitationRole
        )
      ),
      activeDifferentRole: members.filter((m) =>
        inviteEmailsList.find(
          (e) =>
            m.email === e &&
            m.workspaces[0].role !== invitationRole &&
            m.workspaces[0].role !== "none"
        )
      ),
      revoked: members.filter((m) =>
        inviteEmailsList.find(
          (e) => m.email === e && m.workspaces[0].role === "none"
        )
      ),
      notInWorkspace: inviteEmailsList.filter(
        (e) => !members.find((m) => m.email === e)
      ),
    };

    const { notInWorkspace, activeDifferentRole, revoked } = invitesByCase;

    const ReinviteUsersMessage = (
      <div className="mt-6 flex flex-col gap-6 px-2">
        {revoked.length > 0 && (
          <div>
            <div>
              The user(s) below were previously revoked from your workspace.
              Reinstating them will also immediately reinstate their
              conversation history on Dust.
            </div>
            <div className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto rounded border p-2 text-xs">
              {revoked.map((user) => (
                <div
                  key={user.email}
                >{`- ${user.fullName} (${user.email})`}</div>
              ))}
            </div>
          </div>
        )}
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
                } (current role: ${displayRole(
                  user.workspaces[0].role
                )})`}</div>
              ))}
            </div>
          </div>
        )}

        <div>Do you want to proceed?</div>
      </div>
    );
    const hasExistingMembers =
      activeDifferentRole.length > 0 || revoked.length > 0;

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
          members: [...activeDifferentRole, ...revoked],
          role: invitationRole,
          sendNotification,
        });
        await mutate(`/api/w/${owner.sId}/members`);
      }

      await mutate(`/api/w/${owner.sId}/invitations`);
      onClose();
    }
  }

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
          {isProPlanCode(plan.code) && (
            <div className="justify-self-end">
              <ProPlanBillingNotice />
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
  isOpen,
  setOpen,
}: {
  owner: WorkspaceType;
  invitation: MembershipInvitationType;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
}) {
  const sendNotification = useContext(SendNotificationsContext);
  const confirm = useContext(ConfirmContext);

  return (
    <Modal
      title="Edit Invitation"
      isOpen={isOpen}
      onClose={() => {
        setOpen(false);
      }}
      saveLabel="Save"
      savingLabel="Saving..."
      hasChanged={false}
      variant="side-sm"
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
              selectedRole={invitation.initialRole}
              onChange={async (invitationRole) => {
                await updateInvitation({
                  owner,
                  invitation,
                  mutate,
                  sendNotification,
                  newRole: invitationRole,
                });
                setOpen(false);
              }}
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
                  invitationRole: invitation.initialRole,
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
              onClick={async () => {
                await updateInvitation({
                  invitation,
                  owner,
                  mutate,
                  sendNotification,
                  confirm,
                });
              }}
            />
          </div>
        </Page.Layout>
      </Page>
    </Modal>
  );
}

function ProPlanBillingNotice() {
  return (
    <ContentMessage size="md" variant="amber" title="Note">
      <p>
        New users will be charged a{" "}
        <span className="font-semibold">
          monthly fee of {getPriceWithCurrency(PRO_PLAN_29_COST)}
        </span>
        .{" "}
      </p>
      <br />
      <p>
        Next month's bill will be adjusted proportionally based on the members'
        sign-up date.
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
  mutate,
  sendNotification,
  confirm,
}: {
  owner: WorkspaceType;
  invitation: MembershipInvitationType;
  newRole?: RoleType; // Optional parameter for role change
  mutate: any;
  sendNotification: (notificationData: NotificationType) => void;
  confirm?: (confirmData: ConfirmDataType) => Promise<boolean>;
}) {
  if (newRole) {
    const r = await fetch(`/api/w/${owner.sId}/invitations/${invitation.sId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: invitation.status,
        initialRole: newRole,
      }),
    });

    if (!r.ok) {
      const error: { error: { message: string } } = await r.json();
      window.alert(error.error.message);
    }
    sendNotification({
      title: "Success!",
      description: "Invitation role successfully updated.",
      type: "success",
    });
    await mutate(`/api/w/${owner.sId}/invitations`);
  } else {
    if (
      !(
        confirm &&
        (await confirm({
          title: "Revoke invitation",
          message: `Are you sure you want to revoke the invitation for ${invitation.inviteEmail}?`,
          validateLabel: "Yes, revoke",
          validateVariant: "primaryWarning",
        }))
      )
    ) {
      return;
    }

    const res = await fetch(
      `/api/w/${owner.sId}/invitations/${invitation.sId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "revoked",
          initialRole: invitation.initialRole,
        }),
      }
    );

    if (!res.ok) {
      sendNotification({
        type: "error",
        title: "Update failed",
        description: "Failed to update member's invitation.",
      });
    } else {
      sendNotification({
        type: "success",
        title: "Invitation updated",
        description: `Invitation updated for ${invitation.inviteEmail}.`,
      });
      await mutate(`/api/w/${owner.sId}/invitations`);
    }
  }
}
