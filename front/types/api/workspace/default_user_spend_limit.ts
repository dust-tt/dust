export type DefaultUserSpendLimit = {
  awuCredits: number;
};

export type GetDefaultUserSpendLimitResponseBody = {
  awuCredits: number | null;
};

export type PutDefaultUserSpendLimitResponseBody = DefaultUserSpendLimit;
