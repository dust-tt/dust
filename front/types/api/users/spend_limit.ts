import type { SpendLimitOverrideTimeframeType } from "@app/types/credits";

export type UserSpendLimit =
  | { kind: "unlimited" }
  | {
      kind: "limited";
      awuCredits: number;
      // Rolling window the cap is additionally enforced over, on top of the
      // implicit monthly/pool-lifetime window. Omitted/null preserves
      // today's behavior.
      timeframe?: SpendLimitOverrideTimeframeType | null;
      // Epoch ms at which the override auto-reverts to unlimited. Omitted/null
      // means it never expires.
      expiresAt?: number | null;
    };

export type GetUserSpendLimitResponse = UserSpendLimit & {
  // Epoch ms of this user's next AWU credit pool reset (Metronome billing
  // period boundary), if resolvable from an active Metronome contract.
  // Read-only context for admins choosing an override's expiry — never sent
  // on PUT.
  nextCreditResetAt: number | null;
};

export type GetUserSpendLimitResponseBody = GetUserSpendLimitResponse;

export type PutUserSpendLimitResponseBody = SetUserSpendLimitResponse;

export type SetUserSpendLimitResponse = {
  limit: UserSpendLimit;
};
