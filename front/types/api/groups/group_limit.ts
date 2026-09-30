export type GroupLimit =
  | { kind: "unlimited" }
  | { kind: "limited"; awuCredits: number };

export type SetGroupLimitResponse = {
  limit: GroupLimit;
};

export type PutGroupLimitResponseBody = SetGroupLimitResponse;
