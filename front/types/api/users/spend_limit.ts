// Which of the three expiry presets an admin chose for a custom limit —
// distinguishes "1 day" from "next credit refresh" even when both resolve to
// a similar epoch. Single source of truth for both the client (the modal's
// radio group) and the server (request validation).
export const SPEND_LIMIT_EXPIRY_KINDS = [
  "never",
  "one_day",
  "next_credit_reset",
] as const;

export type SpendLimitExpiryKind = (typeof SPEND_LIMIT_EXPIRY_KINDS)[number];

export type UserSpendLimit =
  | { kind: "unlimited" }
  | {
      kind: "limited";
      awuCredits: number;
      // Epoch ms at which the override auto-reverts to unlimited. Omitted/null
      // means it never expires.
      expiresAt?: number | null;
    };

export type GetUserSpendLimitResponse = UserSpendLimit & {
  // Epoch ms of this workspace's next AWU credit pool reset (Metronome
  // billing period boundary), if resolvable from an active Metronome
  // contract. Read-only context for admins choosing an override's expiry —
  // never sent on PUT.
  nextCreditResetAt: number | null;
};

export type GetUserSpendLimitResponseBody = GetUserSpendLimitResponse;

export type PutUserSpendLimitResponseBody = SetUserSpendLimitResponse;

export type SetUserSpendLimitResponse = {
  limit: UserSpendLimit;
};
