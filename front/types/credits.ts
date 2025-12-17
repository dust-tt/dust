import type { EditedByUser } from "@app/types/user";

export const CREDIT_TYPES = ["free", "payg", "committed"] as const;

export type CreditType = (typeof CREDIT_TYPES)[number];

export function isCreditType(value: unknown): value is CreditType {
  return CREDIT_TYPES.includes(value as CreditType);
}

// Credit expiration duration in days (default: 1 year)
export const CREDIT_EXPIRATION_DAYS = 365;

// Minimum purchase amount: $10 in microUsd.
export const MIN_CREDIT_PURCHASE_MICRO_USD = 10_000_000;

export type CreditDisplayData = {
  sId: string;
  type: CreditType;
  initialAmountMicroUsd: number;
  remainingAmountMicroUsd: number;
  consumedAmountMicroUsd: number;
  startDate: number | null;
  expirationDate: number | null;
  boughtByUser: EditedByUser | null;
};

export type GetCreditsResponseBody = {
  credits: CreditDisplayData[];
};
