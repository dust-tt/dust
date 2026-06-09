import {
  isSupportedCurrency,
  type SupportedCurrency,
} from "@app/types/currency";
import type Stripe from "stripe";

/**
 * ISO 3166-1 alpha-2 country codes that map to EUR billing.
 *
 * Includes:
 * - Eurozone (20): AT, BE, CY, EE, FI, FR, DE, GR, IE, IT, LV, LT, LU, MT, NL, PT, SK, SI, ES, HR
 * - Non-euro EU in EEA: BG, CZ, DK, HU, PL, RO, SE
 * - EEA non-EU: IS, LI, NO
 * - Switzerland: CH
 */
const EUR_COUNTRY_CODES: ReadonlySet<string> = new Set([
  // Eurozone
  "AT",
  "BE",
  "CY",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PT",
  "SK",
  "SI",
  "ES",
  "HR",
  // Non-euro EU in EEA
  "BG",
  "CZ",
  "DK",
  "HU",
  "PL",
  "RO",
  "SE",
  // EEA non-EU
  "IS",
  "LI",
  "NO",
  // Switzerland
  "CH",
]);

/** Countries where Stripe prices have a USD currency_option. */
const USD_COUNTRY_CODES: ReadonlySet<string> = new Set(["US"]);

/**
 * Determine billing currency from a country code.
 *
 * Two modes depending on whether the workspace uses Metronome billing:
 * - Metronome (metronomeBilled=true): EU/EEA/CH → EUR, rest of world → USD.
 *   We control the currency via Metronome rate cards.
 * - Stripe (metronomeBilled=false, default): US → USD, rest of world → EUR.
 *   Matches Stripe's adaptive pricing where EUR is the base currency
 *   and USD is the only currency_option.
 */
export function getBillingCurrencyForCountry(
  countryCode: string,
  metronomeBilled = false
): SupportedCurrency {
  const upper = countryCode.toUpperCase();
  if (metronomeBilled) {
    return EUR_COUNTRY_CODES.has(upper) ? "eur" : "usd";
  }
  // Stripe mode: USD only for US, EUR for everyone else (Stripe base currency).
  return USD_COUNTRY_CODES.has(upper) ? "usd" : "eur";
}

/**
 * Map from a base (USD) Metronome package alias to its EUR variant.
 * Returns the original alias if no EUR variant exists or currency is USD.
 */
export function resolvePackageAliasForCurrency(
  baseAlias: string,
  currency: SupportedCurrency
): string {
  if (currency === "usd") {
    return baseAlias;
  }

  const eurAliases: Record<string, string> = {
    "legacy-pro-monthly": "legacy-pro-monthly-eur",
    "legacy-business": "legacy-business-eur",
    "legacy-pro-annual": "legacy-pro-annual-eur",
    "legacy-enterprise": "legacy-enterprise-eur",
    "business-usd": "business-eur",
  };

  return eurAliases[baseAlias] ?? baseAlias;
}

type StripeSubscriptionCurrencySource = Pick<Stripe.Subscription, "currency">;
type StripeCustomerCurrencySource = {
  currency?: Stripe.Customer["currency"];
  address?: Pick<Stripe.Address, "country"> | null;
};

/**
 * Resolve the billing currency for a new Metronome contract from Stripe.
 *
 * Order of precedence:
 * 1. Stripe subscription currency (set as soon as the sub exists).
 * 2. Stripe customer currency (set on first invoice; may be null on a fresh
 *    customer).
 * 3. Country code via getBillingCurrencyForCountry(_, true) — either the
 *    explicit fallback, or the customer's billing address country.
 * 4. Default "usd".
 *
 * Stripe is the only billing source of truth: every prior Metronome
 * contract's currency was itself derived from Stripe, so re-reading it
 * adds no new signal.
 */
export function resolveCurrencyFromStripe({
  stripeSubscription,
  stripeCustomer,
  countryFallback,
}: {
  stripeSubscription?: StripeSubscriptionCurrencySource | null;
  stripeCustomer?: StripeCustomerCurrencySource | null;
  countryFallback?: string | null;
}): SupportedCurrency {
  if (stripeSubscription && isSupportedCurrency(stripeSubscription.currency)) {
    return stripeSubscription.currency;
  }
  if (
    stripeCustomer?.currency &&
    isSupportedCurrency(stripeCustomer.currency)
  ) {
    return stripeCustomer.currency;
  }
  const country = stripeCustomer?.address?.country ?? countryFallback ?? null;
  if (country) {
    return getBillingCurrencyForCountry(country, true);
  }
  return "usd";
}
