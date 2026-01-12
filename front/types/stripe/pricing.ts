import type { SupportedCurrency } from "@app/types/currency";

export type StripePricingData = {
  currencyOptions: Record<SupportedCurrency, { unitAmount: number }>;
};
