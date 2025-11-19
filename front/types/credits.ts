export const CREDIT_TYPES = ["free", "payg", "committed"] as const;

export type CreditType = (typeof CREDIT_TYPES)[number];

export function isCreditType(value: unknown): value is CreditType {
  return CREDIT_TYPES.includes(value as CreditType);
}

export const CREDIT_EXPIRATION_DAYS = 365;
