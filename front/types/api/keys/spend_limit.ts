export type ApiKeySpendLimit =
  | { kind: "unlimited" }
  | { kind: "limited"; awuCredits: number };

export type SetApiKeySpendLimitResponse = {
  limit: ApiKeySpendLimit;
};
