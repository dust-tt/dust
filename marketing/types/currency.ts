export const SUPPORTED_CURRENCIES = ["usd", "eur"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return SUPPORTED_CURRENCIES.includes(value as SupportedCurrency);
}

export const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
  usd: "$",
  eur: "€",
};
