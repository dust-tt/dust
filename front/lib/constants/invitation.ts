// Make token expires after 7 days
export const INVITATION_EXPIRATION_TIME_SEC = 60 * 60 * 24 * 7;

// Single source of truth for the token validity anchor.
// Returns milliseconds: reminderSentAt if a reminder was sent, otherwise createdAt.
export function invitationTokenValidityStartMs(
  createdAtMs: number,
  reminderSentAtMs: number | null
): number {
  return reminderSentAtMs ?? createdAtMs;
}
