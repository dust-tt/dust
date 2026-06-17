import config from "@app/lib/api/config";
import { INVITATION_EXPIRATION_TIME_MS } from "@app/lib/constants/invitation";
import { isDevelopment } from "@app/types/shared/env";
import type { MembershipInvitationType } from "@app/types/membership_invitation";
import type { LightWorkspaceType } from "@app/types/user";
import { sign } from "jsonwebtoken";

export const MEMBERSHIP_INVITATION_TOKEN_COOKIE_NAME =
  "dust_membership_invitation_token";

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
  return `${config.getAppUrl()}/w/${owner.sId}/join/#t=${encodeURIComponent(token)}`;
}

export function getMembershipInvitationTokenCookie(token: string): string {
  const domain = config.getWorkOSSessionCookieDomain();
  const domainFlag = domain ? `; Domain=${domain}` : "";
  const secureFlag = isDevelopment() ? "" : "; Secure";

  return `${MEMBERSHIP_INVITATION_TOKEN_COOKIE_NAME}=${encodeURIComponent(token)}${domainFlag}; Path=/api; HttpOnly${secureFlag}; SameSite=Lax; Max-Age=${Math.floor(INVITATION_EXPIRATION_TIME_MS / 1000)}`;
}

export function getClearMembershipInvitationTokenCookie(): string {
  const domain = config.getWorkOSSessionCookieDomain();
  const domainFlag = domain ? `; Domain=${domain}` : "";
  const secureFlag = isDevelopment() ? "" : "; Secure";

  return `${MEMBERSHIP_INVITATION_TOKEN_COOKIE_NAME}=;${domainFlag}; Path=/api; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly${secureFlag}; SameSite=Lax`;
}
