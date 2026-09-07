export const MIN_USER_SPEND_LIMIT_AWU_CREDITS = 0;
export const MAX_USER_SPEND_LIMIT_AWU_CREDITS = 2_000_000;

export type UserSpendLimit =
  | { kind: "unlimited" }
  | { kind: "limited"; awuCredits: number };

export type GetUserSpendLimitResponse = UserSpendLimit;

export type GetUserSpendLimitResponseBody = GetUserSpendLimitResponse;

export type PutUserSpendLimitResponseBody = SetUserSpendLimitResponse;

export type SetUserSpendLimitResponse = {
  limit: UserSpendLimit;
};
