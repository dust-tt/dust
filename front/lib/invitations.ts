// Maxmimum allowed number of unconsumed invitations per workspace per day.
import type { NotificationType } from "@dust-tt/sparkle";
import { mutate } from "swr";

import type { ConfirmDataType } from "@app/components/Confirm";
import type {
  PostInvitationRequestBody,
  PostInvitationResponseBody,
} from "@app/pages/api/w/[wId]/invitations";
import type {
  ActiveRoleType,
  MembershipInvitationType,
  RoleType,
  WorkspaceType,
} from "@app/types";

export const MAX_UNCONSUMED_INVITATIONS_PER_WORKSPACE_PER_DAY = 300;

export async function updateInvitation({
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
      validateVariant: "warning",
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

export async function sendInvitations({
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

    const errorMessage =
      data?.error?.message || "Failed to invite new members to workspace";

    sendNotification({
      type: "error",
      title: "Invite failed",
      description: errorMessage,
    });
  } else {
    const result: PostInvitationResponseBody = await res.json();
    const failures = result.filter((r) => !r.success);

    if (failures.length > 0) {
      sendNotification({
        type: "error",
        title: "Some invites failed",
        description: result
          .filter((r) => r.error_message)
          .map((r) => r.error_message)
          .join(", "),
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
