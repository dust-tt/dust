export type GroupSpendLimit =
  | { kind: "unlimited" }
  | { kind: "limited"; awuCredits: number };

export type SetGroupSpendLimitResponse = {
  limit: GroupSpendLimit;
};

export type PutGroupSpendLimitResponseBody = SetGroupSpendLimitResponse;
