import type { EditedByUser } from "@app/types/user";

export const CREDIT_TYPES = ["free", "payg", "committed", "excess"] as const;

export type CreditType = (typeof CREDIT_TYPES)[number];

export function isCreditType(value: unknown): value is CreditType {
  return CREDIT_TYPES.includes(value as CreditType);
}

// Credit expiration duration in days (default: 1 year)
export const CREDIT_EXPIRATION_DAYS = 365;

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

export type PendingCreditData = {
  sId: string;
  type: CreditType;
  initialAmountMicroUsd: number;
  paymentUrl: string | null;
  createdAt: number;
};

export type GetCreditsResponseBody = {
  credits: CreditDisplayData[];
  pendingCredits?: PendingCreditData[];
};
