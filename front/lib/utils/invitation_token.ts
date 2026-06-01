import config from "@app/lib/api/config";
import { INVITATION_EXPIRATION_TIME_MS } from "@app/lib/constants/invitation";
import type { MembershipInvitationType } from "@app/types/membership_invitation";
import type { LightWorkspaceType } from "@app/types/user";
import { sign } from "jsonwebtoken";

// After a reminder is sent, the token is re-anchored on reminderSentAt so the recipient gets a fresh 7-day window.
export function getInvitationTokenStartMs({
  createdAt,
  reminderSentAt,
}: {
  createdAt: Date | number;
  reminderSentAt: Date | number | null;
}): number {
  const createdAtMs =
    createdAt instanceof Date ? createdAt.getTime() : createdAt;
  const reminderSentAtMs =
    reminderSentAt instanceof Date ? reminderSentAt.getTime() : reminderSentAt;
  return reminderSentAtMs ?? createdAtMs;
}

export function getMembershipInvitationToken(
  invitation: MembershipInvitationType
) {
  const tokenStartMs = getInvitationTokenStartMs(invitation);
  const iat = Math.floor(tokenStartMs / 1000);
  const exp = Math.floor((tokenStartMs + INVITATION_EXPIRATION_TIME_MS) / 1000);

  return sign(
    {
      membershipInvitationId: invitation.id,
      iat,
      exp,
    },
    config.getDustInviteTokenSecret()
  );
}

export function getMembershipInvitationUrl(
  owner: LightWorkspaceType,
  invitation: MembershipInvitationType
) {
  const token = getMembershipInvitationToken(invitation);
  return `${config.getAppUrl()}/w/${owner.sId}/join/?t=${token}`;
}
