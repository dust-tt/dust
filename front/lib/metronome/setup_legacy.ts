/**
 * Metronome setup — legacy (grandfathered) plans: their rate cards and packages,
 * plus the bits used only by them (the Free-Credits recurring credits, the
 * legacy Workspace-Seat subscription, and the programmatic-USD conversion
 * constants). Shared types/factories come from `setup_common.ts`.
 */

import {
  CREDIT_TYPE_EUR_ID,
  CREDIT_TYPE_USD_ID,
} from "@app/lib/metronome/constants";
import {
  BILLING_CYCLE_CONFIG,
  buildSeatTierRates,
  getCreditTypeProgrammaticUsdId,
  getFreeExcessRecurringCredits,
  type MetricDef,
  makeSeatSubscriptions,
  type PackageDef,
  type RateCardDef,
  type RecurringCreditDef,
  USAGE_TAG,
  WORKSPACE_SEAT_PRODUCT_NAME,
} from "@app/lib/metronome/setup_common";
import {
  DEFAULT_PROGRAMMATIC_USD_EXCESS_RECURRING_AMOUNT,
  FREE_ANNUAL_CREDIT_NAME,
  FREE_MONTHLY_CREDIT_NAME,
  LEGACY_BUSINESS_EUR_PACKAGE_ALIAS,
  LEGACY_BUSINESS_PACKAGE_ALIAS,
  LEGACY_ENTERPRISE_EUR_PACKAGE_ALIAS,
  LEGACY_ENTERPRISE_PACKAGE_ALIAS,
  LEGACY_PRO_ANNUAL_EUR_PACKAGE_ALIAS,
  LEGACY_PRO_ANNUAL_PACKAGE_ALIAS,
  LEGACY_PRO_MONTHLY_EUR_PACKAGE_ALIAS,
  LEGACY_PRO_MONTHLY_PACKAGE_ALIAS,
} from "@app/lib/metronome/types";

const PROGRAMMATIC_USAGE_CREDITS_IN_USD_CENTS = 100;
const PROGRAMMATIC_USAGE_CREDITS_IN_EUR = 0.87;

export const LEGACY_METRICS: MetricDef[] = [
  {
    name: "LLM Provider Cost (Programmatic)",
    event_type_filter: { in_values: ["llm_usage_v3"] },
    property_filters: [
      { name: "cost_micro_usd", exists: true },
      { name: "is_programmatic_usage", in_values: ["true"] },
      { name: "api_key_name", exists: true },
      { name: "model_id", exists: true },
      { name: "origin", exists: true },
      { name: "agent_id", exists: true },
    ],
    aggregation_type: "SUM",
    aggregation_key: "cost_micro_usd",
    group_keys: [["api_key_name"], ["model_id"], ["origin"], ["agent_id"]],
  },
];

// Recurring free credit definition shared by all legacy monthly packages.
// Quantity starts at 0 — the credit.segment.start webhook updates it each period
// to the actual user-based amount.
function getFreeMonthlyRecurringCredits(): RecurringCreditDef {
  return {
    product_name: "Free Credits",
    access_amount: {
      credit_type_id: getCreditTypeProgrammaticUsdId(),
      unit_price: 0,
      quantity: 1,
    },
    commit_duration: { value: 1, unit: "PERIODS" },
    priority: 1,
    starting_at_offset: { unit: "DAYS", value: 0 }, // starts immediately
    applicable_product_tags: [USAGE_TAG],
    recurrence_frequency: "MONTHLY",
    name: FREE_MONTHLY_CREDIT_NAME,
  };
}

// Annual variant for legacy annual packages. Same product, but the credit is granted
// once per year. The credit.segment.start webhook detects ANNUAL recurrence
// and multiplies the monthly bracket amount by 12.
function getFreeAnnualRecurringCredits(): RecurringCreditDef {
  return {
    product_name: "Free Credits",
    access_amount: {
      credit_type_id: getCreditTypeProgrammaticUsdId(),
      unit_price: 0,
      quantity: 1,
    },
    commit_duration: { value: 1, unit: "PERIODS" },
    priority: 1,
    starting_at_offset: { unit: "DAYS", value: 0 }, // starts immediately
    applicable_product_tags: [USAGE_TAG],
    recurrence_frequency: "ANNUAL",
    name: FREE_ANNUAL_CREDIT_NAME,
  };
}

// Legacy Workspace Seat (QUANTITY_ONLY); both frequencies bill the same product.
const LEGACY_SEATS = makeSeatSubscriptions({
  baseTemporaryId: "legacy-seat",
  productName: WORKSPACE_SEAT_PRODUCT_NAME,
  mode: "QUANTITY_ONLY",
  annualUsesSameProduct: true,
});

// Function — evaluated after detectEnvironment() resolves ENV (needed for the
// programmatic-USD credit type used in conversions).
export function getLegacyRateCards(): RateCardDef[] {
  return [
    {
      name: "Legacy Pro USD",
      description:
        "Grandfathered Pro plan. $29/seat via seat subscription. AI usage 30% markup.",
      aliases: [{ name: "legacy-pro-monthly" }],
      fiat_credit_type_id: CREDIT_TYPE_USD_ID,
      credit_type_conversions: [
        {
          custom_credit_type_id: getCreditTypeProgrammaticUsdId(),
          fiat_per_custom_credit: PROGRAMMATIC_USAGE_CREDITS_IN_USD_CENTS,
        },
      ],
      rates: [
        {
          product_name: WORKSPACE_SEAT_PRODUCT_NAME,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          price: 2900,
          billing_frequency: "MONTHLY",
        },
        {
          product_name: "Programmatic Usage",
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          price: 1,
          credit_type_id: getCreditTypeProgrammaticUsdId(),
        },
      ],
    },
    {
      name: "Legacy Business USD",
      description:
        "Grandfathered Business plan. $45/seat via seat subscription. AI usage 30% markup.",
      aliases: [{ name: "legacy-business" }],
      fiat_credit_type_id: CREDIT_TYPE_USD_ID,
      credit_type_conversions: [
        {
          custom_credit_type_id: getCreditTypeProgrammaticUsdId(),
          fiat_per_custom_credit: PROGRAMMATIC_USAGE_CREDITS_IN_USD_CENTS,
        },
      ],
      rates: [
        {
          product_name: WORKSPACE_SEAT_PRODUCT_NAME,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          price: 4500,
          billing_frequency: "MONTHLY",
        },
        {
          product_name: "Programmatic Usage",
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          price: 1,
          credit_type_id: getCreditTypeProgrammaticUsdId(),
        },
      ],
    },
    {
      name: "Legacy Pro Annual USD",
      description:
        "Grandfathered Pro plan (annual). $27/seat/month billed monthly. AI usage 30% markup.",
      aliases: [{ name: "legacy-pro-annual" }],
      fiat_credit_type_id: CREDIT_TYPE_USD_ID,
      credit_type_conversions: [
        {
          custom_credit_type_id: getCreditTypeProgrammaticUsdId(),
          fiat_per_custom_credit: PROGRAMMATIC_USAGE_CREDITS_IN_USD_CENTS,
        },
      ],
      rates: [
        {
          product_name: WORKSPACE_SEAT_PRODUCT_NAME,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          price: 32400,
          billing_frequency: "ANNUAL",
        },
        {
          product_name: "Programmatic Usage",
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          price: 1,
          credit_type_id: getCreditTypeProgrammaticUsdId(),
        },
      ],
    },
    // --- Enterprise plan: MAU-based billing + programmatic usage ---
    // Default: MAU-1 at $45/MAU. MAU-5/MAU-10 not entitled by default but present
    // on the rate card so they can be enabled per contract via overrides.
    // Programmatic usage at $1 = $1 (30% markup baked into product).
    {
      name: "Legacy Enterprise MAU USD",
      description:
        "Enterprise plan. Per-MAU billing + programmatic usage at cost with 30% markup.",
      aliases: [{ name: "legacy-enterprise" }],
      fiat_credit_type_id: CREDIT_TYPE_USD_ID,
      credit_type_conversions: [
        {
          custom_credit_type_id: getCreditTypeProgrammaticUsdId(),
          fiat_per_custom_credit: PROGRAMMATIC_USAGE_CREDITS_IN_USD_CENTS,
        },
      ],
      rates: [
        {
          product_name: "MAU",
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          billing_frequency: "MONTHLY",
          price: 4500,
        },
        {
          product_name: "Programmatic Usage",
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          price: 1,
          credit_type_id: getCreditTypeProgrammaticUsdId(),
        },
        ...buildSeatTierRates({
          prefix: "MAU",
          creditTypeId: CREDIT_TYPE_USD_ID,
        }),
      ],
    },
    // --- EUR variants: same seat prices, billed in EUR ---
    // For Eurozone/EEA/Switzerland customers.
    // Programmatic usage: same product (quantity_conversion converts cost_micro_usd to units),
    // but priced at 87 (€0.87/unit) instead of 100 ($1.00/unit) to apply the USD→EUR FX rate.
    // EUR prices are in whole euros (not cents) — Metronome EUR pricing unit is "EUR".
    {
      name: "Legacy Pro EUR",
      description:
        "Grandfathered Pro plan (EUR). 29€/seat via seat subscription. AI usage 30% markup.",
      aliases: [{ name: "legacy-pro-monthly-eur" }],
      fiat_credit_type_id: CREDIT_TYPE_EUR_ID,
      credit_type_conversions: [
        {
          custom_credit_type_id: getCreditTypeProgrammaticUsdId(),
          fiat_per_custom_credit: PROGRAMMATIC_USAGE_CREDITS_IN_EUR,
        },
      ],
      rates: [
        {
          product_name: WORKSPACE_SEAT_PRODUCT_NAME,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          price: 29,
          billing_frequency: "MONTHLY",
          credit_type_id: CREDIT_TYPE_EUR_ID,
        },
        {
          product_name: "Programmatic Usage",
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          price: 1,
          credit_type_id: getCreditTypeProgrammaticUsdId(),
        },
      ],
    },
    {
      name: "Legacy Business EUR",
      description:
        "Grandfathered Business plan (EUR). 45€/seat via seat subscription. AI usage 30% markup.",
      aliases: [{ name: LEGACY_BUSINESS_EUR_PACKAGE_ALIAS }],
      fiat_credit_type_id: CREDIT_TYPE_EUR_ID,
      credit_type_conversions: [
        {
          custom_credit_type_id: getCreditTypeProgrammaticUsdId(),
          fiat_per_custom_credit: PROGRAMMATIC_USAGE_CREDITS_IN_EUR,
        },
      ],
      rates: [
        {
          product_name: WORKSPACE_SEAT_PRODUCT_NAME,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          price: 45,
          billing_frequency: "MONTHLY",
          credit_type_id: CREDIT_TYPE_EUR_ID,
        },
        {
          product_name: "Programmatic Usage",
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          price: 1,
          credit_type_id: getCreditTypeProgrammaticUsdId(),
        },
      ],
    },
    {
      name: "Legacy Pro Annual EUR",
      description:
        "Grandfathered Pro plan (EUR, annual). 27€/seat/month billed monthly. AI usage 30% markup.",
      aliases: [{ name: "legacy-pro-annual-eur" }],
      fiat_credit_type_id: CREDIT_TYPE_EUR_ID,
      credit_type_conversions: [
        {
          custom_credit_type_id: getCreditTypeProgrammaticUsdId(),
          fiat_per_custom_credit: PROGRAMMATIC_USAGE_CREDITS_IN_EUR,
        },
      ],
      rates: [
        {
          product_name: WORKSPACE_SEAT_PRODUCT_NAME,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          price: 324,
          billing_frequency: "ANNUAL",
          credit_type_id: CREDIT_TYPE_EUR_ID,
        },
        {
          product_name: "Programmatic Usage",
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          price: 1,
          credit_type_id: getCreditTypeProgrammaticUsdId(),
        },
      ],
    },
    {
      name: "Legacy Enterprise MAU EUR",
      description:
        "Enterprise plan (EUR). Per-MAU billing + programmatic usage at cost with 30% markup.",
      aliases: [{ name: "legacy-enterprise-eur" }],
      fiat_credit_type_id: CREDIT_TYPE_EUR_ID,
      credit_type_conversions: [
        {
          custom_credit_type_id: getCreditTypeProgrammaticUsdId(),
          fiat_per_custom_credit: PROGRAMMATIC_USAGE_CREDITS_IN_EUR,
        },
      ],
      rates: [
        {
          product_name: "MAU",
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          billing_frequency: "MONTHLY",
          price: 45,
          credit_type_id: CREDIT_TYPE_EUR_ID,
        },
        {
          product_name: "Programmatic Usage",
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          price: 1,
          credit_type_id: getCreditTypeProgrammaticUsdId(),
        },
        ...buildSeatTierRates({
          prefix: "MAU",
          creditTypeId: CREDIT_TYPE_EUR_ID,
        }),
      ],
    },
  ];
}

export function getLegacyPackages(): PackageDef[] {
  return [
    {
      name: "Legacy Pro USD",
      aliases: [{ name: LEGACY_PRO_MONTHLY_PACKAGE_ALIAS }],
      rate_card_name: "Legacy Pro USD",
      subscriptions: [LEGACY_SEATS.monthly],
      recurring_credits: [
        getFreeMonthlyRecurringCredits(),
        getFreeExcessRecurringCredits(
          getCreditTypeProgrammaticUsdId(),
          DEFAULT_PROGRAMMATIC_USD_EXCESS_RECURRING_AMOUNT
        ),
      ],
      ...BILLING_CYCLE_CONFIG,
    },
    {
      name: "Legacy Business USD",
      aliases: [{ name: LEGACY_BUSINESS_PACKAGE_ALIAS }],
      rate_card_name: "Legacy Business USD",
      subscriptions: [LEGACY_SEATS.monthly],
      recurring_credits: [
        getFreeMonthlyRecurringCredits(),
        getFreeExcessRecurringCredits(
          getCreditTypeProgrammaticUsdId(),
          DEFAULT_PROGRAMMATIC_USD_EXCESS_RECURRING_AMOUNT
        ),
      ],
      ...BILLING_CYCLE_CONFIG,
    },
    {
      name: "Legacy Pro Annual USD",
      aliases: [{ name: LEGACY_PRO_ANNUAL_PACKAGE_ALIAS }],
      rate_card_name: "Legacy Pro Annual USD",
      subscriptions: [LEGACY_SEATS.annual],
      recurring_credits: [
        getFreeAnnualRecurringCredits(),
        getFreeExcessRecurringCredits(
          getCreditTypeProgrammaticUsdId(),
          DEFAULT_PROGRAMMATIC_USD_EXCESS_RECURRING_AMOUNT
        ),
      ],
      ...BILLING_CYCLE_CONFIG,
    },
    // Enterprise: MAU-based billing, no seat subscriptions.
    {
      name: "Legacy Enterprise USD",
      aliases: [{ name: LEGACY_ENTERPRISE_PACKAGE_ALIAS }],
      rate_card_name: "Legacy Enterprise MAU USD",
      scheduled_charges_on_usage_invoices: "ALL",
      recurring_credits: [
        getFreeMonthlyRecurringCredits(),
        getFreeExcessRecurringCredits(
          getCreditTypeProgrammaticUsdId(),
          DEFAULT_PROGRAMMATIC_USD_EXCESS_RECURRING_AMOUNT
        ),
      ],
      ...BILLING_CYCLE_CONFIG,
    },
    // EUR variants
    {
      name: "Legacy Pro EUR",
      aliases: [{ name: LEGACY_PRO_MONTHLY_EUR_PACKAGE_ALIAS }],
      rate_card_name: "Legacy Pro EUR",
      subscriptions: [LEGACY_SEATS.monthly],
      recurring_credits: [
        getFreeMonthlyRecurringCredits(),
        getFreeExcessRecurringCredits(
          getCreditTypeProgrammaticUsdId(),
          DEFAULT_PROGRAMMATIC_USD_EXCESS_RECURRING_AMOUNT
        ),
      ],
      ...BILLING_CYCLE_CONFIG,
    },
    {
      name: "Legacy Business EUR",
      aliases: [{ name: LEGACY_BUSINESS_EUR_PACKAGE_ALIAS }],
      rate_card_name: "Legacy Business EUR",
      subscriptions: [LEGACY_SEATS.monthly],
      recurring_credits: [
        getFreeMonthlyRecurringCredits(),
        getFreeExcessRecurringCredits(
          getCreditTypeProgrammaticUsdId(),
          DEFAULT_PROGRAMMATIC_USD_EXCESS_RECURRING_AMOUNT
        ),
      ],
      ...BILLING_CYCLE_CONFIG,
    },
    {
      name: "Legacy Pro Annual EUR",
      aliases: [{ name: LEGACY_PRO_ANNUAL_EUR_PACKAGE_ALIAS }],
      rate_card_name: "Legacy Pro Annual EUR",
      subscriptions: [LEGACY_SEATS.annual],
      recurring_credits: [
        getFreeAnnualRecurringCredits(),
        getFreeExcessRecurringCredits(
          getCreditTypeProgrammaticUsdId(),
          DEFAULT_PROGRAMMATIC_USD_EXCESS_RECURRING_AMOUNT
        ),
      ],
      ...BILLING_CYCLE_CONFIG,
    },
    {
      name: "Legacy Enterprise EUR",
      aliases: [{ name: LEGACY_ENTERPRISE_EUR_PACKAGE_ALIAS }],
      rate_card_name: "Legacy Enterprise MAU EUR",
      scheduled_charges_on_usage_invoices: "ALL",
      recurring_credits: [
        getFreeMonthlyRecurringCredits(),
        getFreeExcessRecurringCredits(
          getCreditTypeProgrammaticUsdId(),
          DEFAULT_PROGRAMMATIC_USD_EXCESS_RECURRING_AMOUNT
        ),
      ],
      ...BILLING_CYCLE_CONFIG,
    },
  ];
}
