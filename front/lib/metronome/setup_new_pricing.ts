/**
 * Metronome setup — new-pricing plans (Standard USD/EUR + Free): their rate
 * cards and packages, plus the bits used only by them (AWU usage rates, the
 * seat subscription pairs, per-seat AWU credit allocations, and the seat
 * entitlement overrides). Shared types/factories come from `setup_common.ts`.
 */

import {
  CP_ENTERPRISE_BASIS,
  CP_MAX_SEAT_COST_MONTHLY,
  CP_MAX_SEAT_COST_YEARLY,
  CP_PRO_SEAT_COST_MONTHLY,
  CP_PRO_SEAT_COST_YEARLY,
} from "@app/lib/client/subscription";
import {
  AWU_PRIORITY_SEAT_ALLOCATION,
  CREDIT_TYPE_EUR_ID,
  CREDIT_TYPE_USD_ID,
  MAX_SEAT_MONTHLY_AWU_CREDITS,
  PRO_SEAT_MONTHLY_AWU_CREDITS,
  SEAT_PRODUCT_YEARLY_SUFFIX,
  USAGE_TYPE_FREE,
  USAGE_TYPE_GROUP_KEY,
  USAGE_TYPE_PROGRAMMATIC,
  USAGE_TYPE_USER,
} from "@app/lib/metronome/constants";
import { TOOL_CATEGORIES } from "@app/lib/metronome/events";
import {
  BILLING_CYCLE_CONFIG,
  FREE_SEAT_PRODUCT_NAME,
  getCreditTypeAwuId,
  getFreeExcessRecurringCredits,
  getOverageAwuRate,
  MAX_SEAT_CREDIT_NAME,
  MAX_SEAT_PRODUCT_NAME,
  type MetricDef,
  makeSeatSubscription,
  makeSeatSubscriptions,
  type PackageDef,
  type PackageOverrideDef,
  type PackageSubscription,
  PRO_SEAT_CREDIT_NAME,
  PRO_SEAT_PRODUCT_NAME,
  type RateCardDef,
  type RateDef,
  type RecurringCreditDef,
  type SeatSubscriptionPair,
  USAGE_TAG,
  WORKSPACE_SEAT_PRODUCT_NAME,
} from "@app/lib/metronome/setup_common";
import {
  BUSINESS_EUR_PACKAGE_ALIAS,
  BUSINESS_USD_PACKAGE_ALIAS,
  DEFAULT_AWU_EXCESS_RECURRING_AMOUNT,
  DEPRECATED_FREE_PACKAGE_ALIAS,
} from "@app/lib/metronome/types";

export const NEW_METRICS: MetricDef[] = [
  // Tool invocation metric — counts tool uses, group keys cover both user and
  // programmatic events. `is_programmatic_usage` is the authoritative split
  // signal: sentinel values like user_id="unknown" or api_key_name="unknown"
  // are not reliable (programmatic callers without an API key still emit
  // user_id="unknown" but must be classed as programmatic).
  {
    name: "Tool Invocations",
    event_type_filter: { in_values: ["tool_use_v3"] },
    property_filters: [
      { name: "count", exists: true },
      { name: USAGE_TYPE_GROUP_KEY, exists: true },
      { name: "tool_category", exists: true },
      { name: "tool_group", exists: true },
      { name: "user_id", exists: true },
      { name: "api_key_name", exists: true },
      { name: "origin", exists: true },
      { name: "agent_id", exists: true },
      { name: "mcp_server_id", exists: true },
    ],
    aggregation_type: "SUM",
    aggregation_key: "count",
    // 7 group keys — Metronome's default cap is 5; this metric needs an
    // explicit limit increase (granted by Metronome support).
    // Each dimension is combined with `tool_category` so tool invocation
    // counts can be weighted into AWU spend per dimension (basic ×1,
    // advanced ×3). The bare per-dimension keys aren't needed: summing a
    // combined key over `tool_category` recovers the per-dimension total.
    group_keys: [
      ["user_id", USAGE_TYPE_GROUP_KEY, "tool_category"],
      ["user_id"],
      ["tool_category"],
      ["api_key_name", "tool_category"],
      ["origin", "tool_category"],
      ["agent_id", "tool_category"],
      [USAGE_TYPE_GROUP_KEY, "tool_category"],
    ],
  },
  // AWU-based AI cost metric — sums cost_awu directly (no unit conversion).
  // Powers the new AI Usage product on all AWU rate cards (Business, Enterprise).
  // Group keys cover both user and programmatic events; per-seat credit drawdown
  // only matches events whose `user_id` is assigned to a seat.
  {
    name: "LLM Provider Cost AWU",
    event_type_filter: { in_values: ["llm_usage_v3"] },
    property_filters: [
      { name: "cost_awu", exists: true },
      { name: USAGE_TYPE_GROUP_KEY, exists: true },
      { name: "user_id", exists: true },
      { name: "api_key_name", exists: true },
      { name: "model_id", exists: true },
      { name: "origin", exists: true },
      { name: "agent_id", exists: true },
    ],
    aggregation_type: "SUM",
    aggregation_key: "cost_awu",
    // 7 group keys — see note on Tool Invocations above.
    group_keys: [
      ["user_id", USAGE_TYPE_GROUP_KEY],
      ["user_id"],
      ["api_key_name"],
      ["model_id"],
      ["origin"],
      ["agent_id"],
      [USAGE_TYPE_GROUP_KEY],
    ],
  },
  // "(non-free)" twins of the two metrics above. Identical event filter,
  // aggregation, and group keys, but the `usage_type` property filter also
  // excludes free-tagged events (`not_in_values: ["free"]`) so they are never
  // aggregated — any future paid usage_type is still included. `exists: true`
  // is kept because Metronome requires every group-key property to have a
  // matching required (`exists`) property filter. These are NOT attached to any
  // product/rate (they carry no billing meaning); they exist so the usage graph
  // can show usage excluding free without needing a group-key combining each
  // dimension with `usage_type` (the billing metrics above are already at
  // Metronome's 7 group-key cap and can't take more).
  {
    name: "Tool Invocations (non-free)",
    event_type_filter: { in_values: ["tool_use_v3"] },
    property_filters: [
      { name: "count", exists: true },
      {
        name: USAGE_TYPE_GROUP_KEY,
        exists: true,
        not_in_values: [USAGE_TYPE_FREE],
      },
      { name: "tool_category", exists: true },
      { name: "tool_group", exists: true },
      { name: "user_id", exists: true },
      { name: "api_key_name", exists: true },
      { name: "origin", exists: true },
      { name: "agent_id", exists: true },
      { name: "mcp_server_id", exists: true },
    ],
    aggregation_type: "SUM",
    aggregation_key: "count",
    // Same 7 group keys as "Tool Invocations" — see note there.
    group_keys: [
      ["user_id", USAGE_TYPE_GROUP_KEY, "tool_category"],
      ["user_id"],
      ["tool_category"],
      ["api_key_name", "tool_category"],
      ["origin", "tool_category"],
      ["agent_id", "tool_category"],
      [USAGE_TYPE_GROUP_KEY, "tool_category"],
    ],
  },
  {
    name: "LLM Provider Cost AWU (non-free)",
    event_type_filter: { in_values: ["llm_usage_v3"] },
    property_filters: [
      { name: "cost_awu", exists: true },
      {
        name: USAGE_TYPE_GROUP_KEY,
        exists: true,
        not_in_values: [USAGE_TYPE_FREE],
      },
      { name: "user_id", exists: true },
      { name: "api_key_name", exists: true },
      { name: "model_id", exists: true },
      { name: "origin", exists: true },
      { name: "agent_id", exists: true },
    ],
    aggregation_type: "SUM",
    aggregation_key: "cost_awu",
    // Same 7 group keys as "LLM Provider Cost AWU" — see note there.
    group_keys: [
      ["user_id", USAGE_TYPE_GROUP_KEY],
      ["user_id"],
      ["api_key_name"],
      ["model_id"],
      ["origin"],
      ["agent_id"],
      [USAGE_TYPE_GROUP_KEY],
    ],
  },
  // Phase 2 token metrics removed — will be added when Pricing Index is ready.
];

// Per-tier AWU price for Tool Usage rates. Shared across all AWU-priced rate cards
const TOOL_CATEGORY_PRICES_AWU: Record<
  (typeof TOOL_CATEGORIES)[number],
  number
> = {
  basic: 1,
  advanced: 3,
};

// usage_type splits each AWU usage rate: "user" and "programmatic" use the
// nominal price, "free" is priced at 0 (covers free-tagged events, replacing
// the prior recurring-credit mechanism).
const PAID_USAGE_TYPES = [USAGE_TYPE_USER, USAGE_TYPE_PROGRAMMATIC] as const;

function buildAwuToolUsageRates(): RateDef[] {
  return TOOL_CATEGORIES.flatMap((category): RateDef[] => [
    ...PAID_USAGE_TYPES.map(
      (usageType): RateDef => ({
        product_name: "Tool Usage",
        starting_at: "2026-04-01T00:00:00.000Z",
        entitled: true,
        rate_type: "FLAT",
        price: TOOL_CATEGORY_PRICES_AWU[category],
        credit_type_id: getCreditTypeAwuId(),
        pricing_group_values: {
          tool_category: category,
          [USAGE_TYPE_GROUP_KEY]: usageType,
        },
      })
    ),
    {
      product_name: "Tool Usage",
      starting_at: "2026-04-01T00:00:00.000Z",
      entitled: true,
      rate_type: "FLAT",
      price: 0,
      credit_type_id: getCreditTypeAwuId(),
      pricing_group_values: {
        tool_category: category,
        [USAGE_TYPE_GROUP_KEY]: USAGE_TYPE_FREE,
      },
    },
  ]);
}

// AI Usage rates split by usage_type: paid types use the nominal 1 AWU price,
// free is priced at 0.
function buildAwuAiUsageRates(): RateDef[] {
  return [
    ...PAID_USAGE_TYPES.map(
      (usageType): RateDef => ({
        product_name: "AI Usage",
        starting_at: "2026-04-01T00:00:00.000Z",
        entitled: true,
        rate_type: "FLAT",
        price: 1,
        credit_type_id: getCreditTypeAwuId(),
        pricing_group_values: { [USAGE_TYPE_GROUP_KEY]: usageType },
      })
    ),
    {
      product_name: "AI Usage",
      starting_at: "2026-04-01T00:00:00.000Z",
      entitled: true,
      rate_type: "FLAT",
      price: 0,
      credit_type_id: getCreditTypeAwuId(),
      pricing_group_values: { [USAGE_TYPE_GROUP_KEY]: USAGE_TYPE_FREE },
    },
  ];
}

// All seat rates carried by every non-legacy rate card. Each seat (Workspace /
// Pro / Max / Free, monthly + yearly where applicable) is added at
// `entitled: false` with a 0 baseline price. Packages enable the seats they
// sell and stamp their real price via overrides (see
// buildSeatEntitlementOverrides). `creditTypeId` is the rate card's fiat unit.
function buildAllSeatRates(creditTypeId: string): RateDef[] {
  const seat = (
    productName: string,
    billingFrequency: "MONTHLY" | "ANNUAL"
  ): RateDef => ({
    product_name: productName,
    starting_at: "2026-04-01T00:00:00.000Z",
    entitled: false,
    rate_type: "FLAT",
    price: 0,
    billing_frequency: billingFrequency,
    credit_type_id: creditTypeId,
  });
  return [
    seat(WORKSPACE_SEAT_PRODUCT_NAME, "MONTHLY"),
    seat(WORKSPACE_SEAT_PRODUCT_NAME + SEAT_PRODUCT_YEARLY_SUFFIX, "ANNUAL"),
    seat(PRO_SEAT_PRODUCT_NAME, "MONTHLY"),
    seat(PRO_SEAT_PRODUCT_NAME + SEAT_PRODUCT_YEARLY_SUFFIX, "ANNUAL"),
    seat(MAX_SEAT_PRODUCT_NAME, "MONTHLY"),
    seat(MAX_SEAT_PRODUCT_NAME + SEAT_PRODUCT_YEARLY_SUFFIX, "ANNUAL"),
    seat(FREE_SEAT_PRODUCT_NAME, "MONTHLY"),
  ];
}

// Enables the given seats on a package's rate card. Every non-legacy rate card
// carries all seats (Workspace / Pro / Max / Free) at entitled=false with a 0
// baseline price; a package calls this to flip on (entitled=true) the seats it
// sells and stamp each one's flat rate. `seats` is the list of seats to enable;
// a seat with a `price` gets an `overwrite_rate` (rate_type FLAT) in the rate
// card's fiat unit (`creditTypeId`). Omit `price` to flip entitlement only. The
// billing frequency is derived from the product name (the `*_yearly` products
// are ANNUAL) — Metronome requires it when overwriting a subscription rate.
function buildSeatEntitlementOverrides(
  creditTypeId: string,
  seats: Array<{ product_name: string; price?: number }>
): PackageOverrideDef[] {
  return seats.map((seat) => ({
    product_name: seat.product_name,
    entitled: true,
    billing_frequency: seat.product_name.endsWith(SEAT_PRODUCT_YEARLY_SUFFIX)
      ? "ANNUAL"
      : "MONTHLY",
    ...(seat.price !== undefined
      ? { price: seat.price, credit_type_id: creditTypeId }
      : {}),
  }));
}

// Non-legacy seats. Workspace is QUANTITY_ONLY (pooled); Pro / Max are
// SEAT_BASED. Free has no annual variant.
const WORKSPACE_SEATS = makeSeatSubscriptions({
  baseTemporaryId: "workspace-seat",
  productName: WORKSPACE_SEAT_PRODUCT_NAME,
  mode: "QUANTITY_ONLY",
});
const PRO_SEATS = makeSeatSubscriptions({
  baseTemporaryId: "pro-seat",
  productName: PRO_SEAT_PRODUCT_NAME,
  mode: "SEAT_BASED",
});
const MAX_SEATS = makeSeatSubscriptions({
  baseTemporaryId: "max-seat",
  productName: MAX_SEAT_PRODUCT_NAME,
  mode: "SEAT_BASED",
});
// Free Seat SEAT_BASED subscription — priced at $0, used to track free users in
// Metronome so each free seat carries its own lifetime AWU credit pool.
const FREE_SEAT_SUBSCRIPTION = makeSeatSubscription({
  temporaryId: "free-seat-sub",
  productName: FREE_SEAT_PRODUCT_NAME,
  billingFrequency: "MONTHLY",
  mode: "SEAT_BASED",
});

// Per-seat INDIVIDUAL recurring AWU credit attached to a SEAT_BASED subscription.
// Each seat gets its own AWU allocation refreshed every period. The credit
// draws down against any usage product tagged `usage` for the matching
// `user_id` seat.
//
// When `subscription_config` is set, Metronome rejects requests that include
// `access_amount.quantity` (400 "must not specify a quantity if a subscription
// is configured"). The per-seat allocation amount is encoded in
// `access_amount.unit_price` and multiplied by the subscription's seat count
// internally.
function getPerSeatIndividualAwuCredits({
  subscriptionTemporaryId,
  quantityPerSeat,
  name,
}: {
  subscriptionTemporaryId: string;
  quantityPerSeat: number;
  name: string;
}): RecurringCreditDef {
  return {
    product_name: "Seat Individual Credits",
    access_amount: {
      credit_type_id: getCreditTypeAwuId(),
      unit_price: quantityPerSeat,
    },
    commit_duration: { value: 1, unit: "PERIODS" },
    priority: AWU_PRIORITY_SEAT_ALLOCATION,
    starting_at_offset: { unit: "DAYS", value: 0 },
    applicable_product_tags: [USAGE_TAG],
    recurrence_frequency: "MONTHLY",
    name,
    subscription_config: {
      subscription_temporary_id: subscriptionTemporaryId,
      allocation: "INDIVIDUAL",
      apply_seat_increase_config: { is_prorated: false },
    },
  };
}

// Full subscription set carried by every non-legacy package. Workspace seats are
// QUANTITY_ONLY (pooled) while Pro / Max / Free are SEAT_BASED — packages share
// this single mixed set and differ only in which seats they entitle (see the
// per-package overrides). A seat that a package does not entitle stays dormant:
// no seats are ever assigned to it, so it never bills.
const ALL_SEAT_SUBSCRIPTIONS: PackageSubscription[] = [
  WORKSPACE_SEATS.monthly,
  WORKSPACE_SEATS.annual,
  PRO_SEATS.monthly,
  PRO_SEATS.annual,
  MAX_SEATS.monthly,
  MAX_SEATS.annual,
  FREE_SEAT_SUBSCRIPTION,
];

// Per-seat INDIVIDUAL AWU credits for both the monthly and annual subscription
// of a seat pair (same per-seat allocation regardless of billing frequency).
function buildPerSeatCredits(
  pair: SeatSubscriptionPair,
  quantityPerSeat: number,
  name: string
): RecurringCreditDef[] {
  return [pair.monthly, pair.annual].map((sub) =>
    getPerSeatIndividualAwuCredits({
      subscriptionTemporaryId: sub.temporary_id,
      quantityPerSeat,
      name,
    })
  );
}

// Full recurring-credit set tied to the seat subscriptions above, carried by
// every non-legacy package: per-seat INDIVIDUAL AWU allocations for each Pro /
// Max seat (monthly + annual) and the AWU excess credit. A credit attached to a
// dormant seat never materializes (the subscription has no seats). Free seats
// get their AWU grant from a per-user contract credit created at seat-assignment
// time (see `grantFreeSeatCredits`), not from a recurring credit here.
function getAllSeatRecurringCredits(): RecurringCreditDef[] {
  return [
    ...buildPerSeatCredits(
      PRO_SEATS,
      PRO_SEAT_MONTHLY_AWU_CREDITS,
      PRO_SEAT_CREDIT_NAME
    ),
    ...buildPerSeatCredits(
      MAX_SEATS,
      MAX_SEAT_MONTHLY_AWU_CREDITS,
      MAX_SEAT_CREDIT_NAME
    ),
    getFreeExcessRecurringCredits(
      getCreditTypeAwuId(),
      DEFAULT_AWU_EXCESS_RECURRING_AMOUNT
    ),
  ];
}

export function getNewRateCards(): RateCardDef[] {
  return [
    // --- Standard USD: single non-legacy rate card (USD) ---
    // Shared by all non-legacy USD packages (Business + Enterprise, pooled and
    // seat-based). Carries every seat at entitled=false / price 0 plus the
    // AWU-based AI/Tool usage rates; each package enables and prices the seats
    // it sells via overrides. The Business-vs-Enterprise distinction lives
    // entirely in the package overrides, not here.
    {
      name: "Standard USD",
      description:
        "Standard non-legacy plan (USD). Seats priced per-package via overrides + AWU-based AI/Tool usage.",
      aliases: [{ name: "standard-usd" }],
      fiat_credit_type_id: CREDIT_TYPE_USD_ID,
      credit_type_conversions: [
        {
          custom_credit_type_id: getCreditTypeAwuId(),
          fiat_per_custom_credit: getOverageAwuRate("usd"),
        },
      ],
      rates: [
        ...buildAllSeatRates(CREDIT_TYPE_USD_ID),
        ...buildAwuAiUsageRates(),
        ...buildAwuToolUsageRates(),
      ],
    },
    // --- Standard EUR: EUR variant of the single non-legacy rate card ---
    {
      name: "Standard EUR",
      description:
        "Standard non-legacy plan (EUR). Seats priced per-package via overrides + AWU-based AI/Tool usage.",
      aliases: [{ name: "standard-eur" }],
      fiat_credit_type_id: CREDIT_TYPE_EUR_ID,
      credit_type_conversions: [
        {
          custom_credit_type_id: getCreditTypeAwuId(),
          fiat_per_custom_credit: getOverageAwuRate("eur"),
        },
      ],
      rates: [
        ...buildAllSeatRates(CREDIT_TYPE_EUR_ID),
        ...buildAwuAiUsageRates(),
        ...buildAwuToolUsageRates(),
      ],
    },
    // Free plan keeps its own rate card — its overage AWU conversion is 0 (free
    // users are never charged for overage), unlike the Standard cards.
    {
      name: "Free plan",
      description: "Free plan.",
      aliases: [{ name: "free-plan" }],
      fiat_credit_type_id: CREDIT_TYPE_USD_ID,
      credit_type_conversions: [
        {
          custom_credit_type_id: getCreditTypeAwuId(),
          fiat_per_custom_credit: 0,
        },
      ],
      rates: [
        ...buildAllSeatRates(CREDIT_TYPE_USD_ID),
        ...buildAwuAiUsageRates(),
        ...buildAwuToolUsageRates(),
      ],
    },
  ];
}

export function getNewPackages(): PackageDef[] {
  return [
    // Non-legacy packages all carry the same full seat subscription set
    // (ALL_SEAT_SUBSCRIPTIONS) and the same full recurring-credit set
    // (getAllSeatRecurringCredits). They differ only in which seats they
    // entitle — and at what price — via buildSeatEntitlementOverrides. Each
    // rate card carries every seat at entitled=false / price 0, so a package
    // must override to turn on (and price) the seats it sells. Seats a package
    // does not entitle stay dormant (no seats assigned → never bill); their
    // tied recurring credits never materialize.
    {
      name: "Enterprise Pooled USD",
      aliases: [{ name: "enterprise-usd" }],
      rate_card_name: "Standard USD",
      subscriptions: ALL_SEAT_SUBSCRIPTIONS,
      scheduled_charges_on_usage_invoices: "ALL",
      recurring_credits: getAllSeatRecurringCredits(),
      // Enterprise contracts are yearly-only: only the annual seat is entitled.
      overrides: buildSeatEntitlementOverrides(CREDIT_TYPE_USD_ID, [
        {
          product_name:
            WORKSPACE_SEAT_PRODUCT_NAME + SEAT_PRODUCT_YEARLY_SUFFIX,
          price: CP_ENTERPRISE_BASIS * 12 * 100,
        },
      ]),
      ...BILLING_CYCLE_CONFIG,
    },
    {
      name: "Enterprise Pooled EUR",
      aliases: [{ name: "enterprise-eur" }],
      rate_card_name: "Standard EUR",
      subscriptions: ALL_SEAT_SUBSCRIPTIONS,
      scheduled_charges_on_usage_invoices: "ALL",
      recurring_credits: getAllSeatRecurringCredits(),
      // Enterprise contracts are yearly-only: only the annual seat is entitled.
      overrides: buildSeatEntitlementOverrides(CREDIT_TYPE_EUR_ID, [
        {
          product_name:
            WORKSPACE_SEAT_PRODUCT_NAME + SEAT_PRODUCT_YEARLY_SUFFIX,
          price: CP_ENTERPRISE_BASIS * 12,
        },
      ]),
      ...BILLING_CYCLE_CONFIG,
    },
    {
      name: "Enterprise Seat-based USD",
      aliases: [{ name: "enterprise-seat-based-usd" }],
      rate_card_name: "Standard USD",
      subscriptions: ALL_SEAT_SUBSCRIPTIONS,
      scheduled_charges_on_usage_invoices: "ALL",
      recurring_credits: getAllSeatRecurringCredits(),
      // Enterprise contracts are yearly-only: only the annual seats are entitled.
      overrides: buildSeatEntitlementOverrides(CREDIT_TYPE_USD_ID, [
        {
          product_name: PRO_SEAT_PRODUCT_NAME + SEAT_PRODUCT_YEARLY_SUFFIX,
          price: (CP_ENTERPRISE_BASIS + CP_PRO_SEAT_COST_YEARLY) * 12 * 100,
        },
        {
          product_name: MAX_SEAT_PRODUCT_NAME + SEAT_PRODUCT_YEARLY_SUFFIX,
          price: (CP_ENTERPRISE_BASIS + CP_MAX_SEAT_COST_YEARLY) * 12 * 100,
        },
      ]),
      ...BILLING_CYCLE_CONFIG,
    },
    {
      name: "Enterprise Seat-based EUR",
      aliases: [{ name: "enterprise-seat-based-eur" }],
      rate_card_name: "Standard EUR",
      subscriptions: ALL_SEAT_SUBSCRIPTIONS,
      scheduled_charges_on_usage_invoices: "ALL",
      recurring_credits: getAllSeatRecurringCredits(),
      // Enterprise contracts are yearly-only: only the annual seats are entitled.
      overrides: buildSeatEntitlementOverrides(CREDIT_TYPE_EUR_ID, [
        {
          product_name: PRO_SEAT_PRODUCT_NAME + SEAT_PRODUCT_YEARLY_SUFFIX,
          price: (CP_ENTERPRISE_BASIS + CP_PRO_SEAT_COST_YEARLY) * 12,
        },
        {
          product_name: MAX_SEAT_PRODUCT_NAME + SEAT_PRODUCT_YEARLY_SUFFIX,
          price: (CP_ENTERPRISE_BASIS + CP_MAX_SEAT_COST_YEARLY) * 12,
        },
      ]),
      ...BILLING_CYCLE_CONFIG,
    },
    // Business USD / EUR — Pro and Max seats (plus the free starter seat) priced
    // via overrides; per-seat INDIVIDUAL AWU credit allocations (Pro: 8000 /
    // Max: 40000 AWU/month) live in the shared credit set. Customers can
    // upgrade/downgrade between seat tiers via seat moves.
    {
      name: "Business USD",
      aliases: [{ name: BUSINESS_USD_PACKAGE_ALIAS }],
      rate_card_name: "Standard USD",
      subscriptions: ALL_SEAT_SUBSCRIPTIONS,
      scheduled_charges_on_usage_invoices: "ALL",
      recurring_credits: getAllSeatRecurringCredits(),
      overrides: buildSeatEntitlementOverrides(CREDIT_TYPE_USD_ID, [
        {
          product_name: PRO_SEAT_PRODUCT_NAME,
          price: CP_PRO_SEAT_COST_MONTHLY * 100,
        },
        {
          product_name: PRO_SEAT_PRODUCT_NAME + SEAT_PRODUCT_YEARLY_SUFFIX,
          price: CP_PRO_SEAT_COST_YEARLY * 12 * 100,
        },
        {
          product_name: MAX_SEAT_PRODUCT_NAME,
          price: CP_MAX_SEAT_COST_MONTHLY * 100,
        },
        {
          product_name: MAX_SEAT_PRODUCT_NAME + SEAT_PRODUCT_YEARLY_SUFFIX,
          price: CP_MAX_SEAT_COST_YEARLY * 12 * 100,
        },
        { product_name: FREE_SEAT_PRODUCT_NAME, price: 0 },
      ]),
      ...BILLING_CYCLE_CONFIG,
    },
    {
      name: "Business EUR",
      aliases: [{ name: BUSINESS_EUR_PACKAGE_ALIAS }],
      rate_card_name: "Standard EUR",
      subscriptions: ALL_SEAT_SUBSCRIPTIONS,
      scheduled_charges_on_usage_invoices: "ALL",
      recurring_credits: getAllSeatRecurringCredits(),
      overrides: buildSeatEntitlementOverrides(CREDIT_TYPE_EUR_ID, [
        {
          product_name: PRO_SEAT_PRODUCT_NAME,
          price: CP_PRO_SEAT_COST_MONTHLY,
        },
        {
          product_name: PRO_SEAT_PRODUCT_NAME + SEAT_PRODUCT_YEARLY_SUFFIX,
          price: CP_PRO_SEAT_COST_YEARLY * 12,
        },
        {
          product_name: MAX_SEAT_PRODUCT_NAME,
          price: CP_MAX_SEAT_COST_MONTHLY,
        },
        {
          product_name: MAX_SEAT_PRODUCT_NAME + SEAT_PRODUCT_YEARLY_SUFFIX,
          price: CP_MAX_SEAT_COST_YEARLY * 12,
        },
        { product_name: FREE_SEAT_PRODUCT_NAME, price: 0 },
      ]),
      ...BILLING_CYCLE_CONFIG,
    },
    // Free plan — entitles only the Free Seat.
    {
      name: "Free plan",
      aliases: [{ name: DEPRECATED_FREE_PACKAGE_ALIAS }],
      rate_card_name: "Free plan",
      subscriptions: ALL_SEAT_SUBSCRIPTIONS,
      scheduled_charges_on_usage_invoices: "ALL",
      recurring_credits: getAllSeatRecurringCredits(),
      overrides: buildSeatEntitlementOverrides(CREDIT_TYPE_USD_ID, [
        { product_name: FREE_SEAT_PRODUCT_NAME, price: 0 },
      ]),
      ...BILLING_CYCLE_CONFIG,
    },
  ];
}
