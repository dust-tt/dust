// Make token expires after 7 days
export const INVITATION_EXPIRATION_TIME_SEC = 60 * 60 * 24 * 7;
export const INVITATION_EXPIRATION_TIME_MS =
  INVITATION_EXPIRATION_TIME_SEC * 1000;

// Send reminder for invitations created between 7 and 10 days ago.
export const INVITATION_REMINDER_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;
