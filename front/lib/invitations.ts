// Maxmimum allowed number of unconsumed invitations per workspace.
export const MAX_UNCONSUMED_INVITATIONS = 50;
// If the user already received an invitation from this workspace and hasn't consumed it yet, we won't send another one
// before this cooldown period.
export const UNCONSUMED_INVITATION_COOLDOWN_PER_EMAIL_MS = 1000 * 60 * 60 * 24; // 1 day
