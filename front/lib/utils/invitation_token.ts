import config from "@app/lib/api/config";
import { INVITATION_EXPIRATION_TIME_MS } from "@app/lib/constants/invitation";
import { signHS256Jwt } from "@app/lib/utils/hs256_jwt";
import type { MembershipInvitationType } from "@app/types/membership_invitation";
import type { LightWorkspaceType } from "@app/types/user";

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

export async function getMembershipInvitationToken(
  invitation: MembershipInvitationType
): Promise<string> {
  const tokenStartMs = getInvitationTokenStartMs(invitation);
  const iat = Math.floor(tokenStartMs / 1000);
  const exp = Math.floor((tokenStartMs + INVITATION_EXPIRATION_TIME_MS) / 1000);

  return signHS256Jwt(
    {
      membershipInvitationId: invitation.id,
      iat,
      exp,
    },
    config.getDustInviteTokenSecret()
  );
}

export async function getMembershipInvitationUrl(
  owner: LightWorkspaceType,
  invitation: MembershipInvitationType
): Promise<string> {
  const token = await getMembershipInvitationToken(invitation);
  return `${config.getAppUrl()}/w/${owner.sId}/join/?t=${token}`;
}
