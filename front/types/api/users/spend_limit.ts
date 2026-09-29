export const MIN_USER_SPEND_LIMIT_AWU_CREDITS = 0;
export const MAX_USER_SPEND_LIMIT_AWU_CREDITS = 2_000_000;

export type UserSpendLimit =
  | { kind: "unlimited" }
  | { kind: "limited"; awuCredits: number };

export type SetUserSpendLimitRequest =
  | { kind: "unlimited" }
  | {
      kind: "limited";
      awuCredits: number;
      // When true, schedule the override to revert at the end of the current
      // Metronome billing cycle to the member's previous personal override
      // (or no override).
      resetAtNextBillingCycle?: boolean;
    };

export type GetUserSpendLimitResponse = UserSpendLimit;

export type GetUserSpendLimitResponseBody = GetUserSpendLimitResponse;

export type PutUserSpendLimitResponseBody = SetUserSpendLimitResponse;

export type SetUserSpendLimitResponse = {
  limit: UserSpendLimit;
};
