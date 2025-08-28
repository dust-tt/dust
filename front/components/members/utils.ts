import { INVITATION_EXPIRATION_TIME_SEC } from "@app/lib/constants/invitation";

export function isInvitationExpired(createdAt: number): boolean {
  const now = Date.now();
  const expirationTime = createdAt + INVITATION_EXPIRATION_TIME_SEC * 1000;
  return now > expirationTime;
}
