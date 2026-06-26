export type UserSpendLimit =
  | { kind: "unlimited" }
  | { kind: "limited"; awuCredits: number };

export type GetUserSpendLimitResponse = UserSpendLimit;

export type GetUserSpendLimitResponseBody = GetUserSpendLimitResponse;

export type PutUserSpendLimitResponseBody = SetUserSpendLimitResponse;

export type SetUserSpendLimitResponse = {
  limit: UserSpendLimit;
};
