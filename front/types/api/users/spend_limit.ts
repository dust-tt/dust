export const SPEND_LIMIT_EXPIRY_KINDS = [
  "never",
  "one_day",
  "next_credit_reset",
] as const;

export type SpendLimitExpiryKind = (typeof SPEND_LIMIT_EXPIRY_KINDS)[number];

export type UserSpendLimit =
  // No override: falls back to the group cap / seat-type default.
  | { kind: "default" }
  // Explicit override bypassing the group cap and seat-type default entirely
  // — bounded only by the workspace's available credit pool.
  | { kind: "unlimited" }
  | {
      kind: "limited";
      awuCredits: number;
      // Epoch ms at which the override auto-reverts to the default. Omitted/null
      // means it never expires.
      expiresAt?: number | null;
    };

export type GetUserSpendLimitResponse = UserSpendLimit & {
  // Epoch ms of this workspace's next AWU credit pool reset (Metronome
  // billing period boundary), if resolvable from an active Metronome
  // contract.
  nextCreditResetAt: number | null;
};

export type GetUserSpendLimitResponseBody = GetUserSpendLimitResponse;

export type PutUserSpendLimitResponseBody = SetUserSpendLimitResponse;

export type SetUserSpendLimitResponse = {
  limit: UserSpendLimit;
};
