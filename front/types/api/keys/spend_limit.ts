export type ApiKeySpendLimit =
  | { kind: "unlimited" }
  | { kind: "limited"; awuCredits: number };

export type GetApiKeySpendLimitResponse = ApiKeySpendLimit;

export type SetApiKeySpendLimitResponse = {
  limit: ApiKeySpendLimit;
};
