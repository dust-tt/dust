export type AwuTopUpData = {
  /**
   * Metronome grant name — self-describing, e.g. "Credit top-up: 5,000
   * credits", "Free Monthly Credits", "Coupon: WELCOME100".
   */
  name: string;
  amountCredits: number;
  /** When the credits were granted to the workspace pool. */
  grantedAtMs: number;
  /** Exclusive end of the grant's validity period. */
  expiresAtMs: number;
};

export type GetAwuTopUpsHistoryResponseBody = {
  topUps: AwuTopUpData[];
};
