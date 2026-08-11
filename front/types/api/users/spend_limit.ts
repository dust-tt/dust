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
      expiryKind?: SpendLimitExpiryKind;
    };

export type GetUserSpendLimitResponse = UserSpendLimit & {
  // Epoch ms of this workspace's next AWU credit pool reset
  // if resolvable from an active Metronome contract.
  nextCreditResetAt: number | null;
};

export type GetUserSpendLimitResponseBody = GetUserSpendLimitResponse;

export type PutUserSpendLimitResponseBody = SetUserSpendLimitResponse;

export type SetUserSpendLimitResponse = {
  limit: UserSpendLimit;
};
