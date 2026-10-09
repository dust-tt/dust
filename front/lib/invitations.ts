// Maximum allowed number of unconsumed invitations per workspace per day.

import type { ConfirmDataType } from "@app/components/Confirm";
import type { useSendApiErrorNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type {
  PostInvitationRequestBody,
  PostInvitationResponseBody,
} from "@app/types/api/invitation";
import type { MembershipInvitationType } from "@app/types/membership_invitation";
import type { MembershipSeatType } from "@app/types/memberships";
import { isString } from "@app/types/shared/utils/general";
import type { ActiveRoleType, WorkspaceType } from "@app/types/user";
import type { NotificationType } from "@dust-tt/sparkle";
import { plural, select, t } from "@lingui/core/macro";
import { mutate } from "swr";

// Matches the invitations list regardless of query params (e.g. `?includeExpired=true`).
export async function mutateWorkspaceInvitations(owner: WorkspaceType) {
  const invitationsPath = `/api/w/${owner.sId}/invitations`;
  await mutate((key) => isString(key) && key.split("?")[0] === invitationsPath);
}

export async function updateInvitation({
  owner,
  invitation,
  newRole,
  sendNotification,
  sendApiErrorNotification,
  confirm,
}: {
  owner: WorkspaceType;
  invitation: MembershipInvitationType;
  newRole?: ActiveRoleType; // Optional parameter for role change
  sendNotification: (notificationData: NotificationType) => void;
  sendApiErrorNotification: ReturnType<typeof useSendApiErrorNotification>;
  confirm?: (confirmData: ConfirmDataType) => Promise<boolean>;
}) {
  const { inviteEmail } = invitation;
  if (!newRole && confirm) {
    const confirmation = await confirm({
      title: t`Revoke invitation`,
      message: t`Are you sure you want to revoke the invitation for ${inviteEmail}?`,
      validateLabel: t`Yes, revoke`,
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

  const res = await clientFetch(
    `/api/w/${owner.sId}/invitations/${invitation.sId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    sendApiErrorNotification({
      title: newRole ? t`Role update failed` : t`Revoke failed`,
      error: await res.json(),
    });
    return;
  }

  sendNotification({
    type: "success",
    title: newRole ? t`Role updated` : t`Invitation revoked`,
    description: newRole
      ? t`${select(newRole, {
          admin: `Invitation updated to admin for ${inviteEmail}.`,
          manager: `Invitation updated to manager for ${inviteEmail}.`,
          user: `Invitation updated to member for ${inviteEmail}.`,
          other: `Invitation updated for ${inviteEmail}.`,
        })}`
      : t`Invitation revoked for ${inviteEmail}.`,
  });
  await mutateWorkspaceInvitations(owner);
}

export async function sendInvitations({
  owner,
  emails,
  invitationRole,
  seatType,
  sendNotification,
  sendApiErrorNotification,
  isNewInvitation,
}: {
  owner: WorkspaceType;
  emails: string[];
  invitationRole: ActiveRoleType;
  seatType?: MembershipSeatType | null;
  sendNotification: any;
  sendApiErrorNotification: ReturnType<typeof useSendApiErrorNotification>;
  isNewInvitation: boolean;
}) {
  const emailCount = emails.length;
  const body: PostInvitationRequestBody = emails.map((email) => ({
    email,
    role: invitationRole,
    seatType: seatType ?? null,
  }));

  const res = await clientFetch(`/api/w/${owner.sId}/invitations`, {
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
    } catch {
      // ignore
    }
    if (data?.error?.type === "invitation_already_sent_recently") {
      sendNotification({
        type: "error",
        title: t`${plural(emailCount, {
          one: "Invite failed",
          other: "Invites failed",
        })}`,
        description: t`${plural(emailCount, {
          one: "This user has already been invited in the last 24 hours. Please wait before sending another invite.",
          other:
            "These users have already been invited in the last 24 hours. Please wait before sending another invite.",
        })}`,
      });
    }

    sendApiErrorNotification({ title: t`Invite failed`, error: data });
  } else {
    const result: PostInvitationResponseBody = await res.json();
    const failures = result.filter((r) => !r.success);

    if (failures.length > 0) {
      const failureDetails = failures.flatMap(({ email, error_message }) =>
        error_message ? [t`${email}: ${error_message}`] : []
      );
      sendNotification({
        type: "error",
        title: t`Some invites failed`,
        description: t`${plural(failures.length, {
          one: "# invite could not be sent.",
          other: "# invites could not be sent.",
        })}`,
        details:
          failureDetails.length > 0 ? failureDetails.join("\n") : undefined,
      });
    } else {
      sendNotification({
        type: "success",
        title: t`Invites sent`,
        description: isNewInvitation
          ? t`${plural(emailCount, {
              one: "# new invite sent.",
              other: "# new invites sent.",
            })}`
          : t`${plural(emailCount, {
              one: "Sent # invite again.",
              other: "Sent # invites again.",
            })}`,
      });
    }
  }
}
