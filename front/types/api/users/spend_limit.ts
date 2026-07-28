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
    };

export type GetUserSpendLimitResponse = UserSpendLimit;

export type GetUserSpendLimitResponseBody = GetUserSpendLimitResponse;

export type PutUserSpendLimitResponseBody = SetUserSpendLimitResponse;

export type SetUserSpendLimitResponse = {
  limit: UserSpendLimit;
};
