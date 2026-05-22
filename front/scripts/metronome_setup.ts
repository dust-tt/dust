/**
 * Metronome Setup — idempotent TypeScript script using the official SDK.
 *
 * Fetches existing metrics/products/rate cards/packages from Metronome,
 * compares by name, archives stale ones, creates missing ones.
 * Cascading: if a metric is recreated, dependent products are also recreated,
 * which cascades to rate cards, then packages.
 *
 * Run with: npx tsx scripts/metronome_setup.ts [--execute]
 *
 * Without --execute, runs in dry-run mode (logs what would change, no mutations).
 * Requires: METRONOME_API_KEY env var
 */

import {
  AWU_PRICE_PER_CREDIT,
  metronomeAmount,
} from "@app/lib/metronome/amounts";
import { getMetronomeClient } from "@app/lib/metronome/client";
import {
  AWU_PRIORITY_SEAT_ALLOCATION,
  CREDIT_TYPE_EUR_ID,
  CREDIT_TYPE_USD_ID,
  DEV_CREDIT_TYPE_AWU_ID,
  DEV_CREDIT_TYPE_PROG_USD_ID,
  PLAN_CODE_CUSTOM_FIELD_KEY,
  PROD_CREDIT_TYPE_AWU_ID,
  PROD_CREDIT_TYPE_PROG_USD_ID,
  SEAT_TYPE_CUSTOM_FIELD_KEY,
  STRIPE_PRODUCT_ID_CUSTOM_FIELD_KEY,
} from "@app/lib/metronome/constants";
import { TOOL_CATEGORIES } from "@app/lib/metronome/events";
import { invalidateProductSeatTypesCache } from "@app/lib/metronome/seat_types";
import {
  EXCESS_CREDIT_NAME,
  FREE_ANNUAL_CREDIT_NAME,
  FREE_MONTHLY_CREDIT_NAME,
} from "@app/lib/metronome/types";
import type { SupportedCurrency } from "@app/types/currency";

// Number of pricing tiers for any tiered seat-style product (MAU, future).
// Tier products and rates are derived from the prefix.
const SEAT_TIER_COUNT = 6;

const PROGRAMMATIC_USAGE_CREDITS_IN_USD_CENTS = 100;
const PROGRAMMATIC_USAGE_CREDITS_IN_EUR = 0.87;

const getOverageAwuRate = (currency: SupportedCurrency) => {
  return metronomeAmount(AWU_PRICE_PER_CREDIT[currency] * 100, currency) * 2;
};

// Setup-only display names. Runtime code identifies seat-style subscriptions
// via the `DUST_SEAT_TYPE` custom field on the product (see
// SEAT_TYPE_CUSTOM_FIELD_KEY), not by name comparison.
const WORKSPACE_SEAT_PRODUCT_NAME = "Workspace Seat";
const PRO_SEAT_PRODUCT_NAME = "Pro Seat";
const MAX_SEAT_PRODUCT_NAME = "Max Seat";
const YEARLY_SUFFIX = " (Yearly)";
const FREE_SEAT_PRODUCT_NAME = "Free Seat";
const PRO_SEAT_CREDIT_NAME = "Pro Seat Credits";
const MAX_SEAT_CREDIT_NAME = "Max Seat Credits";
const FREE_SEAT_CREDIT_NAME = "Free Seat Credits";

// Per-seat AWU allocations stamped onto recurring credits at package creation.
// Runtime code reads the allocation from the contract's `recurring_credits`,
// so these values aren't referenced anywhere else.
const PRO_SEAT_MONTHLY_AWU_CREDITS = 8000;
const MAX_SEAT_MONTHLY_AWU_CREDITS = 40000;
// Per-seat AWU grant carried by the Free Seat subscription. Granted once
// per seat on contract start and valid for the lifetime of the contract.
// Never refilled.
const FREE_SEAT_LIFETIME_AWU_CREDITS = 300;

if (!process.env.METRONOME_API_KEY) {
  console.error("METRONOME_API_KEY env var required");
  process.exit(1);
}

const EXECUTE = process.argv.includes("--execute");

const client = getMetronomeClient();

// Detect environment by listing pricing units and checking for the AWU credit type.
// AWU and Programmatic USD have different IDs in sandbox vs production; USD/EUR are the same.

async function detectEnvironment(): Promise<"sandbox" | "production"> {
  const creditTypeIds = new Set<string>();
  for await (const pu of client.v1.pricingUnits.list()) {
    if (pu.id) {
      creditTypeIds.add(pu.id);
    }
  }
  if (creditTypeIds.has(PROD_CREDIT_TYPE_AWU_ID)) {
    return "production";
  }
  if (creditTypeIds.has(DEV_CREDIT_TYPE_AWU_ID)) {
    return "sandbox";
  }
  throw new Error(
    "Cannot detect Metronome environment: AWU credit type not found. " +
      `Expected sandbox=${DEV_CREDIT_TYPE_AWU_ID} or production=${PROD_CREDIT_TYPE_AWU_ID}`
  );
}

// Resolved in main() before anything else runs.
let ENV: "sandbox" | "production" = "sandbox";

// Credit type accessors based on the script-detected ENV (not NODE_ENV).
function getCreditTypeAwuId(): string {
  return ENV === "sandbox" ? DEV_CREDIT_TYPE_AWU_ID : PROD_CREDIT_TYPE_AWU_ID;
}

function getCreditTypeProgrammaticUsdId(): string {
  return ENV === "sandbox"
    ? DEV_CREDIT_TYPE_PROG_USD_ID
    : PROD_CREDIT_TYPE_PROG_USD_ID;
}

// ---------------------------------------------------------------------------
// Types for desired state definitions
// ---------------------------------------------------------------------------

interface MetricDef {
  name: string;
  event_type_filter: { in_values: string[] };
  property_filters: Array<{
    name: string;
    exists?: boolean;
    in_values?: string[];
  }>;
  aggregation_type: "SUM" | "COUNT" | "max";
  aggregation_key?: string;
  group_keys?: string[][];
}

interface ProductDef {
  name: string;
  type: "USAGE" | "SUBSCRIPTION" | "FIXED";
  billable_metric_name?: string;
  quantity_conversion?: {
    conversion_factor: number;
    operation: "DIVIDE" | "MULTIPLY";
  };
  quantity_rounding?: {
    decimal_places: number;
    rounding_method: "ROUND_UP" | "ROUND_DOWN" | "ROUND_HALF_UP";
  };
  pricing_group_key?: string[];
  presentation_group_key?: string[];
  tags?: string[];
  /**
   * Custom fields stamped on the product. Reconciled via `setValues` so a
   * field change does NOT trigger a product recreate.
   */
  custom_fields?: Record<string, string>;
}

interface RateDef {
  product_name: string;
  starting_at: string;
  entitled: boolean;
  rate_type: string;
  price: number;
  billing_frequency?: string;
  credit_type_id?: string;
  pricing_group_values?: Record<string, string>;
}

interface RateCardDef {
  name: string;
  description: string;
  aliases: Array<{ name: string }>;
  fiat_credit_type_id: string;
  credit_type_conversions?: Array<{
    custom_credit_type_id: string;
    fiat_per_custom_credit: number;
  }>;
  rates: RateDef[];
}

interface PackageSubscription {
  temporary_id: string;
  product_name: string; // resolved to product ID at runtime
  billing_frequency: "MONTHLY" | "QUARTERLY" | "ANNUAL" | "WEEKLY";
  collection_schedule: "ADVANCE" | "ARREARS";
  quantity_management_mode: "SEAT_BASED" | "QUANTITY_ONLY";
  seat_config?: { seat_group_key: string };
  /** Required for QUANTITY_ONLY mode — initial seat count (set at contract creation). */
  initial_quantity?: number;
  proration?: {
    is_prorated: boolean;
    invoice_behavior?: "BILL_IMMEDIATELY" | "BILL_ON_NEXT_COLLECTION_DATE";
  };
}

interface RecurringCreditDef {
  product_name: string; // resolved to product ID at runtime
  access_amount: {
    credit_type_id: string; // evaluated after detectEnvironment()
    unit_price: number;
    quantity?: number;
  };
  commit_duration: { value: number; unit?: "PERIODS" };
  priority: number;
  starting_at_offset: {
    unit: "DAYS" | "WEEKS" | "MONTHS" | "YEARS";
    value: number;
  };
  applicable_product_tags?: string[];
  // Mutually exclusive with applicable_product_tags. Filters drawdown by
  // pricing/presentation group values (e.g. { is_free_usage: "true" }).
  specifiers?: Array<{
    presentation_group_values?: Record<string, string>;
    pricing_group_values?: Record<string, string>;
    product_tags?: string[];
  }>;
  recurrence_frequency?: "MONTHLY" | "QUARTERLY" | "ANNUAL" | "WEEKLY";
  // Optional. Offset relative to the recurring credit start that determines
  // when the contract will stop creating recurring commits. Use a very small
  // value (e.g. 1 day) to make the credit one-shot — Metronome fires the
  // first commit on contract start, then the duration expires before the
  // next would be issued.
  duration?: {
    unit: "DAYS" | "WEEKS" | "MONTHS" | "YEARS";
    value: number;
  };
  name?: string;
  // Attach the credit to a SEAT_BASED subscription so each seat gets its own
  // allocation (INDIVIDUAL) or all seats share one pool (POOLED).
  // `subscription_temporary_id` references the `temporary_id` of a Subscription
  // defined in the same package payload.
  subscription_config?: {
    subscription_temporary_id: string;
    allocation: "INDIVIDUAL" | "POOLED";
    apply_seat_increase_config: { is_prorated: boolean };
  };
}

// Package-level entitlement override for a specific product on the package's
// rate card, applied from contract start. Used by the Enterprise Seat-based
// packages to flip the default rate-card entitlements (Workspace true → false,
// Pro/Max/Free false → true) without duplicating the rate card. Only flips
// `entitled` — the rate-card's price/billing_frequency/credit_type are
// preserved.
interface PackageOverrideDef {
  product_name: string;
  entitled: boolean;
}

interface PackageDef {
  // Base name without version suffix. Version is auto-computed at sync time.
  name: string;
  aliases: Array<{ name: string }>;
  rate_card_name: string;
  subscriptions?: PackageSubscription[];
  // Billing cycle anchored to contract start date (matches Stripe subscription anniversary).
  billing_anchor_date?: "contract_start_date" | "first_billing_period";
  usage_statement_schedule?: {
    frequency: "MONTHLY" | "QUARTERLY" | "ANNUAL" | "WEEKLY";
    day?: "CONTRACT_START" | "FIRST_OF_MONTH";
  };
  // Consolidate scheduled/commit charges onto the usage invoice instead of separate invoices.
  scheduled_charges_on_usage_invoices?: "ALL";
  recurring_credits?: RecurringCreditDef[];
  overrides?: PackageOverrideDef[];
}

// ---------------------------------------------------------------------------
// Desired state
// ---------------------------------------------------------------------------

const METRICS: MetricDef[] = [
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
      { name: "usage_type", exists: true },
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
    group_keys: [
      ["user_id", "usage_type", "tool_category"],
      ["user_id"],
      ["api_key_name"],
      ["tool_category"],
      ["origin"],
      ["agent_id"],
      ["usage_type"],
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
      { name: "usage_type", exists: true },
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
      ["user_id", "usage_type"],
      ["user_id"],
      ["api_key_name"],
      ["model_id"],
      ["origin"],
      ["agent_id"],
      ["usage_type"],
    ],
  },
  // Phase 2 token metrics removed — will be added when Pricing Index is ready.
];

// Tag shared by all AI/Tool usage products — use `applicable_product_tags: ["usage"]`
// on credits/commits to apply them to all usage products at once.
const USAGE_TAG = "usage";

const PRODUCTS: ProductDef[] = [
  // --- Legacy usage product (USD, 30% markup baked into quantity_conversion) ---
  {
    name: "Programmatic Usage",
    type: "USAGE",
    billable_metric_name: "LLM Provider Cost (Programmatic)",
    // Convert cost_micro_usd to billable USD: multiply by 1.3 (30% markup) / 1_000_000 (micro→USD).
    // The rate card prices at $1.00/unit so the final amount equals the marked-up cost.
    quantity_conversion: {
      conversion_factor: 1.3 / 1_000_000,
      operation: "MULTIPLY",
    },
    // Round up to cents (2 decimal places) — never undercharge.
    quantity_rounding: { decimal_places: 2, rounding_method: "ROUND_UP" },
    tags: [USAGE_TAG],
  },
  // --- New pricing usage products (AWU) ---
  // 1 AWU = $0.01. AI Usage is priced directly on the cost_awu event property
  // (no quantity_conversion). Tool Usage: count × tool_weight = AWU (weight
  // configured per tool category in rate card via pricing_group_values).
  // Single product per usage type — the metric carries both `user_id` and
  // `api_key_name` as group keys so per-seat credits and workspace pool credits
  // are dispatched correctly by Metronome based on the event's properties.
  {
    name: "AI Usage",
    type: "USAGE",
    billable_metric_name: "LLM Provider Cost AWU",
    pricing_group_key: ["usage_type"],
    presentation_group_key: ["user_id"],
    tags: [USAGE_TAG],
  },
  {
    name: "Tool Usage",
    type: "USAGE",
    billable_metric_name: "Tool Invocations",
    pricing_group_key: ["usage_type", "tool_category"],
    presentation_group_key: ["user_id"],
    tags: [USAGE_TAG],
  },
  // Workspace Seat — single SUBSCRIPTION product covering both legacy (ANNUAL)
  // and new (MONTHLY) per-seat plans. Seats synced from membership create/revoke
  // hooks; price/frequency differs between rate cards.
  {
    name: WORKSPACE_SEAT_PRODUCT_NAME,
    type: "SUBSCRIPTION",
    custom_fields: { [SEAT_TYPE_CUSTOM_FIELD_KEY]: "workspace" },
  },
  {
    name: WORKSPACE_SEAT_PRODUCT_NAME + YEARLY_SUFFIX,
    type: "SUBSCRIPTION",
    custom_fields: { [SEAT_TYPE_CUSTOM_FIELD_KEY]: "workspace_yearly" },
  },
  // Pro Seat / Max Seat — SUBSCRIPTION products for the new Business / Enterprise
  // seat-based plans. Used as SEAT_BASED subscriptions in packages with per-seat
  // INDIVIDUAL recurring credits (Pro: 8000 AWU/mo, Max: 40000 AWU/mo).
  {
    name: PRO_SEAT_PRODUCT_NAME,
    type: "SUBSCRIPTION",
    custom_fields: { [SEAT_TYPE_CUSTOM_FIELD_KEY]: "pro" },
  },
  {
    name: PRO_SEAT_PRODUCT_NAME + YEARLY_SUFFIX,
    type: "SUBSCRIPTION",
    custom_fields: { [SEAT_TYPE_CUSTOM_FIELD_KEY]: "pro_yearly" },
  },
  {
    name: MAX_SEAT_PRODUCT_NAME,
    type: "SUBSCRIPTION",
    custom_fields: { [SEAT_TYPE_CUSTOM_FIELD_KEY]: "max" },
  },
  {
    name: MAX_SEAT_PRODUCT_NAME + YEARLY_SUFFIX,
    type: "SUBSCRIPTION",
    custom_fields: { [SEAT_TYPE_CUSTOM_FIELD_KEY]: "max_yearly" },
  },

  // Free Seat — SUBSCRIPTION product priced at $0/seat. Carries a one-shot
  // lifetime AWU credit (300 AWU per seat) so free users have a small drawdown
  // pool without being billed.
  {
    name: FREE_SEAT_PRODUCT_NAME,
    type: "SUBSCRIPTION",
    custom_fields: { [SEAT_TYPE_CUSTOM_FIELD_KEY]: "free" },
  },
  // MAU product — single subscription for simple (non-tiered) enterprise contracts.
  // Used when no MAU_TIERS custom field is set on the contract.
  { name: "MAU", type: "SUBSCRIPTION" },
  // Tiered seat products — one per pricing tier for contracts with graduated
  // pricing. Not entitled by default; enabled per contract via overrides.
  // Quantity managed by the MAU/seat sync flow based on the contract's tier
  // custom field.
  ...buildSeatTierProducts("MAU"),
  // MAU Commit — appears as a line item on invoices for the monthly minimum charge.
  { name: "MAU Commit", type: "FIXED" },
  // FIXED products for credit grants — separate products for distinct invoice line items.
  {
    name: "Free Credits",
    type: "FIXED",
  },
  {
    name: "Excess Credits",
    type: "FIXED",
  },
  {
    name: "Prepaid Commit",
    type: "FIXED",
  },
  {
    name: "Seat Individual Credits",
    type: "FIXED",
  },
  {
    name: "PAYG Overage",
    type: "FIXED",
  },
  {
    name: "Seat Subscription Credits",
    type: "FIXED",
  },
];

// "MAU Tier 1", …, "MAU Tier 6".
function buildSeatTierProductNames(prefix: string): string[] {
  return Array.from(
    { length: SEAT_TIER_COUNT },
    (_, i) => `${prefix} Tier ${i + 1}`
  );
}

// SUBSCRIPTION product entries to inject into PRODUCTS for a tiered seat family.
function buildSeatTierProducts(prefix: string): ProductDef[] {
  return buildSeatTierProductNames(prefix).map(
    (name): ProductDef => ({ name, type: "SUBSCRIPTION" })
  );
}

// Default rate entries for a tiered seat family on a rate card. Not entitled
// by default — enabled per contract via overrides with per-tier pricing.
function buildSeatTierRates({
  prefix,
  creditTypeId,
}: {
  prefix: string;
  creditTypeId: string;
}): RateDef[] {
  return buildSeatTierProductNames(prefix).map(
    (name): RateDef => ({
      product_name: name,
      starting_at: "2026-04-01T00:00:00.000Z",
      entitled: false,
      rate_type: "FLAT",
      billing_frequency: "MONTHLY",
      price: 0,
      credit_type_id: creditTypeId,
    })
  );
}

// Per-category AWU price for Tool Usage rates. 1 AWU per invocation by default;
// deep_research costs 2 AWU. Shared across all AWU-priced rate cards
// (Business USD, Business EUR, Enterprise EUR).
const TOOL_CATEGORY_PRICES_AWU: Record<
  (typeof TOOL_CATEGORIES)[number],
  number
> = {
  retrieval: 1,
  deep_research: 2,
  reasoning: 1,
  connectors: 1,
  generation: 1,
  agents: 1,
  actions: 1,
  platform: 1,
};

// usage_type splits each AWU usage rate: "user" and "programmatic" use the
// nominal price, "free" is priced at 0 (covers free-tagged events, replacing
// the prior recurring-credit mechanism).
const PAID_USAGE_TYPES = ["user", "programmatic"] as const;

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
          usage_type: usageType,
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
      pricing_group_values: { tool_category: category, usage_type: "free" },
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
        pricing_group_values: { usage_type: usageType },
      })
    ),
    {
      product_name: "AI Usage",
      starting_at: "2026-04-01T00:00:00.000Z",
      entitled: true,
      rate_type: "FLAT",
      price: 0,
      credit_type_id: getCreditTypeAwuId(),
      pricing_group_values: { usage_type: "free" },
    },
  ];
}

// Function — evaluated after detectEnvironment() resolves ENV (needed for AWU credit type).
function getRateCards(): RateCardDef[] {
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
      aliases: [{ name: "legacy-business-eur" }],
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
    // --- Enterprise USD: new (non-legacy) enterprise rate card ---
    // Same shape as Enterprise EUR, priced in USD.
    // - Workspace Seat: $45/seat/month (price in cents).
    // - AI Usage: 1 AWU per cost_awu unit for user/programmatic usage, 0 for free.
    // - Tool Usage: per-category AWU price (×1/×2) for user/programmatic, 0 for free.
    {
      name: "Enterprise USD",
      description:
        "Enterprise plan (USD). Per-seat billing + AWU-based AI/Tool usage.",
      aliases: [{ name: "enterprise-usd" }],
      fiat_credit_type_id: CREDIT_TYPE_USD_ID,
      credit_type_conversions: [
        {
          custom_credit_type_id: getCreditTypeAwuId(),
          fiat_per_custom_credit: getOverageAwuRate("usd"),
        },
      ],
      rates: [
        {
          product_name: WORKSPACE_SEAT_PRODUCT_NAME,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          billing_frequency: "MONTHLY",
          price: 2000,
          credit_type_id: CREDIT_TYPE_USD_ID,
        },
        {
          product_name: WORKSPACE_SEAT_PRODUCT_NAME + YEARLY_SUFFIX,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          billing_frequency: "ANNUAL",
          price: 24000,
          credit_type_id: CREDIT_TYPE_USD_ID,
        },
        {
          product_name: PRO_SEAT_PRODUCT_NAME,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: false,
          rate_type: "FLAT",
          billing_frequency: "MONTHLY",
          price: 4400,
          credit_type_id: CREDIT_TYPE_USD_ID,
        },
        {
          product_name: PRO_SEAT_PRODUCT_NAME + YEARLY_SUFFIX,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: false,
          rate_type: "FLAT",
          billing_frequency: "ANNUAL",
          price: 528000,
          credit_type_id: CREDIT_TYPE_USD_ID,
        },
        {
          product_name: MAX_SEAT_PRODUCT_NAME,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: false,
          rate_type: "FLAT",
          billing_frequency: "MONTHLY",
          price: 14000,
          credit_type_id: CREDIT_TYPE_USD_ID,
        },
        {
          product_name: MAX_SEAT_PRODUCT_NAME + YEARLY_SUFFIX,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: false,
          rate_type: "FLAT",
          billing_frequency: "ANNUAL",
          price: 168000,
          credit_type_id: CREDIT_TYPE_USD_ID,
        },
        {
          product_name: FREE_SEAT_PRODUCT_NAME,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: false,
          rate_type: "FLAT",
          billing_frequency: "MONTHLY",
          price: 0,
          credit_type_id: CREDIT_TYPE_USD_ID,
        },
        ...buildAwuAiUsageRates(),
        ...buildAwuToolUsageRates(),
      ],
    },
    // --- Enterprise EUR: new (non-legacy) enterprise rate card ---
    // Per-seat billing in EUR + AWU-based AI/Tool usage.
    // - Workspace Seat: €45/seat/month (subscription).
    // - AI Usage: 1 AWU per cost_awu unit for user/programmatic usage, 0 for free.
    // - Tool Usage: per-category AWU price (×1/×2) for user/programmatic, 0 for free.
    {
      name: "Enterprise EUR",
      description:
        "Enterprise plan (EUR). Per-seat billing + AWU-based AI/Tool usage.",
      aliases: [{ name: "enterprise-eur" }],
      fiat_credit_type_id: CREDIT_TYPE_EUR_ID,
      credit_type_conversions: [
        {
          custom_credit_type_id: getCreditTypeAwuId(),
          fiat_per_custom_credit: getOverageAwuRate("eur"),
        },
      ],
      rates: [
        {
          product_name: WORKSPACE_SEAT_PRODUCT_NAME,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          billing_frequency: "MONTHLY",
          price: 20,
          credit_type_id: CREDIT_TYPE_EUR_ID,
        },
        {
          product_name: WORKSPACE_SEAT_PRODUCT_NAME + YEARLY_SUFFIX,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          billing_frequency: "ANNUAL",
          price: 240,
          credit_type_id: CREDIT_TYPE_EUR_ID,
        },
        {
          product_name: PRO_SEAT_PRODUCT_NAME,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: false,
          rate_type: "FLAT",
          billing_frequency: "MONTHLY",
          price: 44,
          credit_type_id: CREDIT_TYPE_EUR_ID,
        },
        {
          product_name: PRO_SEAT_PRODUCT_NAME + YEARLY_SUFFIX,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: false,
          rate_type: "FLAT",
          billing_frequency: "ANNUAL",
          price: 528,
          credit_type_id: CREDIT_TYPE_EUR_ID,
        },
        {
          product_name: MAX_SEAT_PRODUCT_NAME,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: false,
          rate_type: "FLAT",
          billing_frequency: "MONTHLY",
          price: 140,
          credit_type_id: CREDIT_TYPE_EUR_ID,
        },
        {
          product_name: MAX_SEAT_PRODUCT_NAME + YEARLY_SUFFIX,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: false,
          rate_type: "FLAT",
          billing_frequency: "ANNUAL",
          price: 1680,
          credit_type_id: CREDIT_TYPE_EUR_ID,
        },
        {
          product_name: FREE_SEAT_PRODUCT_NAME,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: false,
          rate_type: "FLAT",
          billing_frequency: "MONTHLY",
          price: 0,
          credit_type_id: CREDIT_TYPE_EUR_ID,
        },
        ...buildAwuAiUsageRates(),
        ...buildAwuToolUsageRates(),
      ],
    },
    // --- Business USD: new seat-based plan (Pro / Max seats) ---
    // Pro Seat: $29/mo. Max Seat: $149/mo. Both billed MONTHLY.
    // AI/Tool usage priced in AWU (1 AWU = 1 USD cent = $0.01).
    // Per-seat credit allocation lives in the package (8000 / 40000 AWU/mo).
    {
      name: "Business USD",
      description:
        "Business plan (USD). Pro/Max seats with per-seat AWU credit allocation.",
      aliases: [{ name: "business-usd" }],
      // free for first-time joiners (one-shot starter), pro for re-joiners.
      fiat_credit_type_id: CREDIT_TYPE_USD_ID,
      credit_type_conversions: [
        {
          custom_credit_type_id: getCreditTypeAwuId(),
          fiat_per_custom_credit: getOverageAwuRate("usd"),
        },
      ],
      rates: [
        {
          product_name: PRO_SEAT_PRODUCT_NAME,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          billing_frequency: "MONTHLY",
          price: 3000,
          credit_type_id: CREDIT_TYPE_USD_ID,
        },
        {
          product_name: PRO_SEAT_PRODUCT_NAME + YEARLY_SUFFIX,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          billing_frequency: "ANNUAL",
          price: 28800,
          credit_type_id: CREDIT_TYPE_USD_ID,
        },
        {
          product_name: MAX_SEAT_PRODUCT_NAME,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          billing_frequency: "MONTHLY",
          price: 15000,
          credit_type_id: CREDIT_TYPE_USD_ID,
        },
        {
          product_name: MAX_SEAT_PRODUCT_NAME + YEARLY_SUFFIX,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          billing_frequency: "ANNUAL",
          price: 144000,
          credit_type_id: CREDIT_TYPE_USD_ID,
        },
        {
          product_name: FREE_SEAT_PRODUCT_NAME,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          billing_frequency: "MONTHLY",
          price: 0,
          credit_type_id: CREDIT_TYPE_USD_ID,
        },
        ...buildAwuAiUsageRates(),
        ...buildAwuToolUsageRates(),
      ],
    },
    // --- Business EUR: EUR variant of the seat-based plan ---
    // Same shape as Business USD; EUR prices in whole euros.
    {
      name: "Business EUR",
      description:
        "Business plan (EUR). Pro/Max seats with per-seat AWU credit allocation.",
      aliases: [{ name: "business-eur" }],
      // free for first-time joiners (one-shot starter), pro for re-joiners.
      fiat_credit_type_id: CREDIT_TYPE_EUR_ID,
      credit_type_conversions: [
        {
          custom_credit_type_id: getCreditTypeAwuId(),
          fiat_per_custom_credit: getOverageAwuRate("eur"),
        },
      ],
      rates: [
        {
          product_name: PRO_SEAT_PRODUCT_NAME,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          billing_frequency: "MONTHLY",
          price: 30,
          credit_type_id: CREDIT_TYPE_EUR_ID,
        },
        {
          product_name: PRO_SEAT_PRODUCT_NAME + YEARLY_SUFFIX,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          billing_frequency: "ANNUAL",
          price: 288,
          credit_type_id: CREDIT_TYPE_EUR_ID,
        },
        {
          product_name: MAX_SEAT_PRODUCT_NAME,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          billing_frequency: "MONTHLY",
          price: 150,
          credit_type_id: CREDIT_TYPE_EUR_ID,
        },
        {
          product_name: MAX_SEAT_PRODUCT_NAME + YEARLY_SUFFIX,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          billing_frequency: "ANNUAL",
          price: 1440,
          credit_type_id: CREDIT_TYPE_EUR_ID,
        },
        {
          product_name: FREE_SEAT_PRODUCT_NAME,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          billing_frequency: "MONTHLY",
          price: 0,
          credit_type_id: CREDIT_TYPE_EUR_ID,
        },
        ...buildAwuAiUsageRates(),
        ...buildAwuToolUsageRates(),
      ],
    },
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
        {
          product_name: FREE_SEAT_PRODUCT_NAME,
          starting_at: "2026-04-01T00:00:00.000Z",
          entitled: true,
          rate_type: "FLAT",
          billing_frequency: "MONTHLY",
          price: 0,
          credit_type_id: CREDIT_TYPE_USD_ID,
        },
        ...buildAwuAiUsageRates(),
        ...buildAwuToolUsageRates(),
      ],
    },
  ];
}

// Entitlement-flip overrides for the Seat-based Enterprise packages. The
// rate card carries the default Pooled-style entitlements (Workspace=true,
// Pro/Max/Free=false); for the Seat-based variant we flip them (Workspace=
// false, Pro/Max/Free=true). The rate-card's price / billing_frequency /
// credit_type stay in effect — only entitled changes.
function buildSeatEntitlementFlipOverrides(): PackageOverrideDef[] {
  return [
    { product_name: WORKSPACE_SEAT_PRODUCT_NAME, entitled: false },
    {
      product_name: WORKSPACE_SEAT_PRODUCT_NAME + YEARLY_SUFFIX,
      entitled: false,
    },
    { product_name: PRO_SEAT_PRODUCT_NAME, entitled: true },
    { product_name: PRO_SEAT_PRODUCT_NAME + YEARLY_SUFFIX, entitled: true },
    { product_name: MAX_SEAT_PRODUCT_NAME, entitled: true },
    { product_name: MAX_SEAT_PRODUCT_NAME + YEARLY_SUFFIX, entitled: true },
    { product_name: FREE_SEAT_PRODUCT_NAME, entitled: true },
  ];
}

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

function getFreeExcessRecurringCredits(
  creditTypeId: string,
  quantity: number
): RecurringCreditDef {
  return {
    product_name: "Excess Credits",
    access_amount: {
      credit_type_id: creditTypeId,
      unit_price: 0,
      quantity,
    },
    commit_duration: { value: 1, unit: "PERIODS" },
    priority: 999,
    starting_at_offset: { unit: "DAYS", value: 0 }, // starts immediately
    applicable_product_tags: [USAGE_TAG],
    recurrence_frequency: "MONTHLY",
    name: EXCESS_CREDIT_NAME,
  };
}

// Seat subscription definition shared by all legacy packages.
const LEGACY_SEAT_SUBSCRIPTION: PackageSubscription = {
  temporary_id: "legacy-seat-sub",
  product_name: WORKSPACE_SEAT_PRODUCT_NAME,
  billing_frequency: "MONTHLY",
  collection_schedule: "ADVANCE",
  quantity_management_mode: "QUANTITY_ONLY",
  initial_quantity: 1,
  proration: {
    is_prorated: true,
    invoice_behavior: "BILL_ON_NEXT_COLLECTION_DATE",
  },
};

// Seat subscription definition shared by all legacy packages.
const LEGACY_SEAT_ANNUAL_SUBSCRIPTION: PackageSubscription = {
  temporary_id: "legacy-seat-annual-sub",
  product_name: WORKSPACE_SEAT_PRODUCT_NAME,
  billing_frequency: "ANNUAL",
  collection_schedule: "ADVANCE",
  quantity_management_mode: "QUANTITY_ONLY",
  initial_quantity: 1,
  proration: {
    is_prorated: true,
    invoice_behavior: "BILL_ON_NEXT_COLLECTION_DATE",
  },
};

// Seat subscription definition for new (non-legacy) per-seat packages.
// Same shape as LEGACY_SEAT_ANNUAL_SUBSCRIPTION but billed MONTHLY. Reuses the
// Workspace Seat product so legacy and new plans share a single seat product.
const WORKSPACE_SEAT_MONTHLY_SUBSCRIPTION: PackageSubscription = {
  temporary_id: "workspace-seat-monthly-sub",
  product_name: WORKSPACE_SEAT_PRODUCT_NAME,
  billing_frequency: "MONTHLY",
  collection_schedule: "ADVANCE",
  quantity_management_mode: "QUANTITY_ONLY",
  initial_quantity: 1,
  proration: {
    is_prorated: true,
    invoice_behavior: "BILL_ON_NEXT_COLLECTION_DATE",
  },
};
const WORKSPACE_SEAT_ANNUAL_SUBSCRIPTION: PackageSubscription = {
  temporary_id: "workspace-seat-annual-sub",
  product_name: WORKSPACE_SEAT_PRODUCT_NAME + YEARLY_SUFFIX,
  billing_frequency: "ANNUAL",
  collection_schedule: "ADVANCE",
  quantity_management_mode: "QUANTITY_ONLY",
  initial_quantity: 1,
  proration: {
    is_prorated: true,
    invoice_behavior: "BILL_ON_NEXT_COLLECTION_DATE",
  },
};

// SEAT_BASED subscriptions for the Business (and seat-based Enterprise) plans.
// Seat group key is `user_id` — usage events carrying that property draw down
// only the credits attached to the matching seat. The seat count is controlled
// by add_seat_ids / remove_seat_ids via the contract edit API.
const PRO_SEAT_SUBSCRIPTION_TEMPORARY_ID = "pro-seat-sub";
const PRO_SEAT_SUBSCRIPTION: PackageSubscription = {
  temporary_id: PRO_SEAT_SUBSCRIPTION_TEMPORARY_ID,
  product_name: PRO_SEAT_PRODUCT_NAME,
  billing_frequency: "MONTHLY",
  collection_schedule: "ADVANCE",
  quantity_management_mode: "SEAT_BASED",
  seat_config: { seat_group_key: "user_id" },
  proration: {
    is_prorated: true,
    invoice_behavior: "BILL_ON_NEXT_COLLECTION_DATE",
  },
};

const PRO_SEAT_ANNUAL_SUBSCRIPTION_TEMPORARY_ID = "pro-seat-annual-sub";
const PRO_SEAT_ANNUAL_SUBSCRIPTION: PackageSubscription = {
  temporary_id: PRO_SEAT_ANNUAL_SUBSCRIPTION_TEMPORARY_ID,
  product_name: PRO_SEAT_PRODUCT_NAME + YEARLY_SUFFIX,
  billing_frequency: "ANNUAL",
  collection_schedule: "ADVANCE",
  quantity_management_mode: "SEAT_BASED",
  seat_config: { seat_group_key: "user_id" },
  proration: {
    is_prorated: true,
    invoice_behavior: "BILL_ON_NEXT_COLLECTION_DATE",
  },
};

const MAX_SEAT_SUBSCRIPTION_TEMPORARY_ID = "max-seat-sub";
const MAX_SEAT_SUBSCRIPTION: PackageSubscription = {
  temporary_id: MAX_SEAT_SUBSCRIPTION_TEMPORARY_ID,
  product_name: MAX_SEAT_PRODUCT_NAME,
  billing_frequency: "MONTHLY",
  collection_schedule: "ADVANCE",
  quantity_management_mode: "SEAT_BASED",
  seat_config: { seat_group_key: "user_id" },
  proration: {
    is_prorated: true,
    invoice_behavior: "BILL_ON_NEXT_COLLECTION_DATE",
  },
};

const MAX_SEAT_ANNUAL_SUBSCRIPTION_TEMPORARY_ID = "max-seat-annual-sub";
const MAX_SEAT_ANNUAL_SUBSCRIPTION: PackageSubscription = {
  temporary_id: MAX_SEAT_ANNUAL_SUBSCRIPTION_TEMPORARY_ID,
  product_name: MAX_SEAT_PRODUCT_NAME + YEARLY_SUFFIX,
  billing_frequency: "ANNUAL",
  collection_schedule: "ADVANCE",
  quantity_management_mode: "SEAT_BASED",
  seat_config: { seat_group_key: "user_id" },
  proration: {
    is_prorated: true,
    invoice_behavior: "BILL_ON_NEXT_COLLECTION_DATE",
  },
};

// Free Seat SEAT_BASED subscription — priced at $0, used to track free users
// in Metronome so each free seat carries its own lifetime AWU credit pool.
const FREE_SEAT_SUBSCRIPTION_TEMPORARY_ID = "free-seat-sub";

const FREE_SEAT_SUBSCRIPTION: PackageSubscription = {
  temporary_id: FREE_SEAT_SUBSCRIPTION_TEMPORARY_ID,
  product_name: FREE_SEAT_PRODUCT_NAME,
  billing_frequency: "MONTHLY",
  collection_schedule: "ADVANCE",
  quantity_management_mode: "SEAT_BASED",
  seat_config: { seat_group_key: "user_id" },
  proration: {
    // Free seats cost $0 so proration is moot, but keep is_prorated: true to
    // match the other SEAT_BASED subscriptions.
    is_prorated: true,
    invoice_behavior: "BILL_ON_NEXT_COLLECTION_DATE",
  },
};

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
      apply_seat_increase_config: { is_prorated: true },
    },
  };
}

// Per-seat INDIVIDUAL AWU credit attached to the Free Seat SEAT_BASED
// subscription. Issued exactly once per seat:
//   - `duration: { value: 1, unit: "DAYS" }` stops the recurrence after the
//     first commit (which fires on contract start / seat assignment), so the
//     credit is never re-issued.
//   - `commit_duration: { value: 100, unit: "YEARS" }`... not supported by
//     Metronome (`PERIODS` only), so we approximate with 100 ANNUAL periods
//     — effectively the lifetime of any reasonable contract.
//   - Not prorated on seat increase: a new free seat always gets the full
//     300 AWU grant regardless of when in the period it was added.
function getFreeSeatLifetimeAwuCredits(): RecurringCreditDef {
  return {
    product_name: "Seat Individual Credits",
    access_amount: {
      credit_type_id: getCreditTypeAwuId(),
      unit_price: FREE_SEAT_LIFETIME_AWU_CREDITS,
    },
    commit_duration: { value: 100, unit: "PERIODS" },
    priority: 200,
    starting_at_offset: { unit: "DAYS", value: 0 },
    applicable_product_tags: [USAGE_TAG],
    recurrence_frequency: "ANNUAL",
    duration: { value: 1, unit: "DAYS" },
    name: FREE_SEAT_CREDIT_NAME,
    subscription_config: {
      subscription_temporary_id: FREE_SEAT_SUBSCRIPTION_TEMPORARY_ID,
      allocation: "INDIVIDUAL",
      apply_seat_increase_config: { is_prorated: false },
    },
  };
}

// Billing cycle config shared by all packages — anchored to contract start date.
const BILLING_CYCLE_CONFIG = {
  billing_anchor_date: "contract_start_date" as const,
  usage_statement_schedule: {
    frequency: "MONTHLY" as const,
    day: "CONTRACT_START" as const,
  },
};

// Packages have NO billing_provider — billing provider is set at contract creation time.
// Shadow mode: create contract without billing_provider_configuration → invoices stay in Metronome.
// Real billing: create contract with billing_provider_configuration: { billing_provider: "stripe" }.
// Package names are versioned (v1, v2, ...) to track pricing changes.
// Aliases stay stable — code always references the alias, which points to the latest version.
// Old versions are archived automatically when a new version is created with the same alias.
// Package names and contract_name are auto-versioned at sync time (e.g., "Legacy Pro USD v3").
// The version is derived from existing packages in Metronome: if the current package matches,
// keep its version; if it needs recreation, increment by 1.
function getPackages(): PackageDef[] {
  return [
    {
      name: "Legacy Pro USD",
      aliases: [{ name: "legacy-pro-monthly" }],
      rate_card_name: "Legacy Pro USD",
      subscriptions: [LEGACY_SEAT_SUBSCRIPTION],
      recurring_credits: [
        getFreeMonthlyRecurringCredits(),
        getFreeExcessRecurringCredits(getCreditTypeProgrammaticUsdId(), 5_000),
      ],
      ...BILLING_CYCLE_CONFIG,
    },
    {
      name: "Legacy Business USD",
      aliases: [{ name: "legacy-business" }],
      rate_card_name: "Legacy Business USD",
      subscriptions: [LEGACY_SEAT_SUBSCRIPTION],
      recurring_credits: [
        getFreeMonthlyRecurringCredits(),
        getFreeExcessRecurringCredits(getCreditTypeProgrammaticUsdId(), 5_000),
      ],
      ...BILLING_CYCLE_CONFIG,
    },
    {
      name: "Legacy Pro Annual USD",
      aliases: [{ name: "legacy-pro-annual" }],
      rate_card_name: "Legacy Pro Annual USD",
      subscriptions: [LEGACY_SEAT_ANNUAL_SUBSCRIPTION],
      recurring_credits: [
        getFreeAnnualRecurringCredits(),
        getFreeExcessRecurringCredits(getCreditTypeProgrammaticUsdId(), 5_000),
      ],
      ...BILLING_CYCLE_CONFIG,
    },
    // Enterprise: MAU-based billing, no seat subscriptions.
    {
      name: "Legacy Enterprise USD",
      aliases: [{ name: "legacy-enterprise" }],
      rate_card_name: "Legacy Enterprise MAU USD",
      scheduled_charges_on_usage_invoices: "ALL",
      recurring_credits: [
        getFreeMonthlyRecurringCredits(),
        getFreeExcessRecurringCredits(getCreditTypeProgrammaticUsdId(), 5_000),
      ],
      ...BILLING_CYCLE_CONFIG,
    },
    // EUR variants
    {
      name: "Legacy Pro EUR",
      aliases: [{ name: "legacy-pro-monthly-eur" }],
      rate_card_name: "Legacy Pro EUR",
      subscriptions: [LEGACY_SEAT_SUBSCRIPTION],
      recurring_credits: [
        getFreeMonthlyRecurringCredits(),
        getFreeExcessRecurringCredits(getCreditTypeProgrammaticUsdId(), 5_000),
      ],
      ...BILLING_CYCLE_CONFIG,
    },
    {
      name: "Legacy Business EUR",
      aliases: [{ name: "legacy-business-eur" }],
      rate_card_name: "Legacy Business EUR",
      subscriptions: [LEGACY_SEAT_SUBSCRIPTION],
      recurring_credits: [
        getFreeMonthlyRecurringCredits(),
        getFreeExcessRecurringCredits(getCreditTypeProgrammaticUsdId(), 5_000),
      ],
      ...BILLING_CYCLE_CONFIG,
    },
    {
      name: "Legacy Pro Annual EUR",
      aliases: [{ name: "legacy-pro-annual-eur" }],
      rate_card_name: "Legacy Pro Annual EUR",
      subscriptions: [LEGACY_SEAT_ANNUAL_SUBSCRIPTION],
      recurring_credits: [
        getFreeAnnualRecurringCredits(),
        getFreeExcessRecurringCredits(getCreditTypeProgrammaticUsdId(), 5_000),
      ],
      ...BILLING_CYCLE_CONFIG,
    },
    {
      name: "Legacy Enterprise EUR",
      aliases: [{ name: "legacy-enterprise-eur" }],
      rate_card_name: "Legacy Enterprise MAU EUR",
      scheduled_charges_on_usage_invoices: "ALL",
      recurring_credits: [
        getFreeMonthlyRecurringCredits(),
        getFreeExcessRecurringCredits(getCreditTypeProgrammaticUsdId(), 5_000),
      ],
      ...BILLING_CYCLE_CONFIG,
    },
    // New Enterprise USD / EUR — per-seat billing on Workspace Seat (MONTHLY)
    // + AWU AI/Tool usage. Includes a recurring AWU credit that draws down on
    // usage tagged as free via the `is_free_usage` presentation group.
    {
      name: "Enterprise Pooled USD",
      aliases: [{ name: "enterprise-usd" }],
      rate_card_name: "Enterprise USD",
      subscriptions: [
        WORKSPACE_SEAT_MONTHLY_SUBSCRIPTION,
        WORKSPACE_SEAT_ANNUAL_SUBSCRIPTION,
      ],
      scheduled_charges_on_usage_invoices: "ALL",
      recurring_credits: [
        getFreeExcessRecurringCredits(getCreditTypeAwuId(), 5_000),
      ],
      ...BILLING_CYCLE_CONFIG,
    },
    {
      name: "Enterprise Pooled EUR",
      aliases: [{ name: "enterprise-eur" }],
      rate_card_name: "Enterprise EUR",
      subscriptions: [
        WORKSPACE_SEAT_MONTHLY_SUBSCRIPTION,
        WORKSPACE_SEAT_ANNUAL_SUBSCRIPTION,
      ],
      scheduled_charges_on_usage_invoices: "ALL",
      recurring_credits: [
        getFreeExcessRecurringCredits(getCreditTypeAwuId(), 5_000),
      ],
      ...BILLING_CYCLE_CONFIG,
    },
    {
      name: "Enterprise Seat-based USD",
      aliases: [{ name: "enterprise-seat-based-usd" }],
      rate_card_name: "Enterprise USD",
      subscriptions: [
        PRO_SEAT_SUBSCRIPTION,
        PRO_SEAT_ANNUAL_SUBSCRIPTION,
        MAX_SEAT_SUBSCRIPTION,
        MAX_SEAT_ANNUAL_SUBSCRIPTION,
        FREE_SEAT_SUBSCRIPTION,
      ],
      scheduled_charges_on_usage_invoices: "ALL",
      recurring_credits: [
        getPerSeatIndividualAwuCredits({
          subscriptionTemporaryId: MAX_SEAT_SUBSCRIPTION_TEMPORARY_ID,
          quantityPerSeat: MAX_SEAT_MONTHLY_AWU_CREDITS,
          name: MAX_SEAT_CREDIT_NAME,
        }),
        getPerSeatIndividualAwuCredits({
          subscriptionTemporaryId: PRO_SEAT_ANNUAL_SUBSCRIPTION_TEMPORARY_ID,
          quantityPerSeat: PRO_SEAT_MONTHLY_AWU_CREDITS,
          name: PRO_SEAT_CREDIT_NAME,
        }),
        getPerSeatIndividualAwuCredits({
          subscriptionTemporaryId: PRO_SEAT_SUBSCRIPTION_TEMPORARY_ID,
          quantityPerSeat: PRO_SEAT_MONTHLY_AWU_CREDITS,
          name: PRO_SEAT_CREDIT_NAME,
        }),
        getPerSeatIndividualAwuCredits({
          subscriptionTemporaryId: MAX_SEAT_ANNUAL_SUBSCRIPTION_TEMPORARY_ID,
          quantityPerSeat: MAX_SEAT_MONTHLY_AWU_CREDITS,
          name: MAX_SEAT_CREDIT_NAME,
        }),
        getFreeExcessRecurringCredits(getCreditTypeAwuId(), 5_000),
      ],
      overrides: buildSeatEntitlementFlipOverrides(),
      ...BILLING_CYCLE_CONFIG,
    },
    {
      name: "Enterprise Seat-based EUR",
      aliases: [{ name: "enterprise-seat-based-eur" }],
      rate_card_name: "Enterprise EUR",
      subscriptions: [
        PRO_SEAT_SUBSCRIPTION,
        PRO_SEAT_ANNUAL_SUBSCRIPTION,
        MAX_SEAT_SUBSCRIPTION,
        MAX_SEAT_ANNUAL_SUBSCRIPTION,
        FREE_SEAT_SUBSCRIPTION,
      ],
      scheduled_charges_on_usage_invoices: "ALL",
      recurring_credits: [
        getPerSeatIndividualAwuCredits({
          subscriptionTemporaryId: PRO_SEAT_SUBSCRIPTION_TEMPORARY_ID,
          quantityPerSeat: PRO_SEAT_MONTHLY_AWU_CREDITS,
          name: PRO_SEAT_CREDIT_NAME,
        }),
        getPerSeatIndividualAwuCredits({
          subscriptionTemporaryId: PRO_SEAT_ANNUAL_SUBSCRIPTION_TEMPORARY_ID,
          quantityPerSeat: PRO_SEAT_MONTHLY_AWU_CREDITS,
          name: PRO_SEAT_CREDIT_NAME,
        }),
        getPerSeatIndividualAwuCredits({
          subscriptionTemporaryId: MAX_SEAT_SUBSCRIPTION_TEMPORARY_ID,
          quantityPerSeat: MAX_SEAT_MONTHLY_AWU_CREDITS,
          name: MAX_SEAT_CREDIT_NAME,
        }),
        getPerSeatIndividualAwuCredits({
          subscriptionTemporaryId: MAX_SEAT_ANNUAL_SUBSCRIPTION_TEMPORARY_ID,
          quantityPerSeat: MAX_SEAT_MONTHLY_AWU_CREDITS,
          name: MAX_SEAT_CREDIT_NAME,
        }),
        getFreeExcessRecurringCredits(getCreditTypeAwuId(), 5_000),
      ],
      overrides: buildSeatEntitlementFlipOverrides(),
      ...BILLING_CYCLE_CONFIG,
    },
    // New Business USD / EUR — Pro and Max seats as SEAT_BASED subscriptions
    // with per-seat INDIVIDUAL AWU credit allocations (Pro: 8000 / Max: 40000
    // AWU/month). Both seat tiers live in the same package so customers can
    // upgrade/downgrade between them via seat moves.
    {
      name: "Business USD",
      aliases: [{ name: "business-usd" }],
      rate_card_name: "Business USD",
      subscriptions: [
        PRO_SEAT_SUBSCRIPTION,
        PRO_SEAT_ANNUAL_SUBSCRIPTION,
        MAX_SEAT_SUBSCRIPTION,
        MAX_SEAT_ANNUAL_SUBSCRIPTION,
        FREE_SEAT_SUBSCRIPTION,
      ],
      scheduled_charges_on_usage_invoices: "ALL",
      recurring_credits: [
        getPerSeatIndividualAwuCredits({
          subscriptionTemporaryId: PRO_SEAT_SUBSCRIPTION_TEMPORARY_ID,
          quantityPerSeat: PRO_SEAT_MONTHLY_AWU_CREDITS,
          name: PRO_SEAT_CREDIT_NAME,
        }),
        getPerSeatIndividualAwuCredits({
          subscriptionTemporaryId: PRO_SEAT_ANNUAL_SUBSCRIPTION_TEMPORARY_ID,
          quantityPerSeat: PRO_SEAT_MONTHLY_AWU_CREDITS,
          name: PRO_SEAT_CREDIT_NAME,
        }),
        getPerSeatIndividualAwuCredits({
          subscriptionTemporaryId: MAX_SEAT_SUBSCRIPTION_TEMPORARY_ID,
          quantityPerSeat: MAX_SEAT_MONTHLY_AWU_CREDITS,
          name: MAX_SEAT_CREDIT_NAME,
        }),
        getPerSeatIndividualAwuCredits({
          subscriptionTemporaryId: MAX_SEAT_ANNUAL_SUBSCRIPTION_TEMPORARY_ID,
          quantityPerSeat: MAX_SEAT_MONTHLY_AWU_CREDITS,
          name: MAX_SEAT_CREDIT_NAME,
        }),
        getFreeSeatLifetimeAwuCredits(),
        getFreeExcessRecurringCredits(getCreditTypeAwuId(), 5_000),
      ],
      ...BILLING_CYCLE_CONFIG,
    },
    {
      name: "Business EUR",
      aliases: [{ name: "business-eur" }],
      rate_card_name: "Business EUR",
      subscriptions: [
        PRO_SEAT_SUBSCRIPTION,
        PRO_SEAT_ANNUAL_SUBSCRIPTION,
        MAX_SEAT_SUBSCRIPTION,
        MAX_SEAT_ANNUAL_SUBSCRIPTION,
        FREE_SEAT_SUBSCRIPTION,
      ],
      scheduled_charges_on_usage_invoices: "ALL",
      recurring_credits: [
        getPerSeatIndividualAwuCredits({
          subscriptionTemporaryId: PRO_SEAT_SUBSCRIPTION_TEMPORARY_ID,
          quantityPerSeat: PRO_SEAT_MONTHLY_AWU_CREDITS,
          name: PRO_SEAT_CREDIT_NAME,
        }),
        getPerSeatIndividualAwuCredits({
          subscriptionTemporaryId: PRO_SEAT_ANNUAL_SUBSCRIPTION_TEMPORARY_ID,
          quantityPerSeat: PRO_SEAT_MONTHLY_AWU_CREDITS,
          name: PRO_SEAT_CREDIT_NAME,
        }),
        getPerSeatIndividualAwuCredits({
          subscriptionTemporaryId: MAX_SEAT_SUBSCRIPTION_TEMPORARY_ID,
          quantityPerSeat: MAX_SEAT_MONTHLY_AWU_CREDITS,
          name: MAX_SEAT_CREDIT_NAME,
        }),
        getPerSeatIndividualAwuCredits({
          subscriptionTemporaryId: MAX_SEAT_ANNUAL_SUBSCRIPTION_TEMPORARY_ID,
          quantityPerSeat: MAX_SEAT_MONTHLY_AWU_CREDITS,
          name: MAX_SEAT_CREDIT_NAME,
        }),
        getFreeSeatLifetimeAwuCredits(),
        getFreeExcessRecurringCredits(getCreditTypeAwuId(), 5_000),
      ],
      ...BILLING_CYCLE_CONFIG,
    },
    // Free plan — entitles only the Free Seat
    {
      name: "Free plan",
      aliases: [{ name: "free-plan" }],
      rate_card_name: "Free plan",
      subscriptions: [FREE_SEAT_SUBSCRIPTION],
      scheduled_charges_on_usage_invoices: "ALL",
      recurring_credits: [getFreeSeatLifetimeAwuCredits()],
      ...BILLING_CYCLE_CONFIG,
    },
  ];
}

// ---------------------------------------------------------------------------
// State tracking
// ---------------------------------------------------------------------------

const ids = {
  metrics: {} as Record<string, string>,
  products: {} as Record<string, string>,
  rateCards: {} as Record<string, string>,
  packages: {} as Record<string, string>,
};

const recreated = {
  metrics: new Set<string>(),
  products: new Set<string>(),
  rateCards: new Set<string>(),
};

// Skip manually created test objects — never archive them.
function isTestObject(name: string): boolean {
  return name.toLowerCase().startsWith("test");
}

// ---------------------------------------------------------------------------
// Sync: Metrics
// ---------------------------------------------------------------------------

async function syncMetrics(): Promise<void> {
  console.log("\n=== Syncing Metrics ===");

  const existing: Array<{
    id: string;
    name: string;
    aggregation_key?: string;
    aggregation_type?: string;
    group_keys?: string[][];
    event_type_filter?: { in_values: string[] };
    property_filters?: Array<{
      name: string;
      exists?: boolean;
      in_values?: string[];
    }>;
  }> = [];
  for await (const m of client.v1.billableMetrics.list()) {
    existing.push(m as (typeof existing)[number]);
  }

  const byName = new Map(existing.map((m) => [m.name, m]));
  const desiredNames = new Set(METRICS.map((m) => m.name));

  for (const m of existing) {
    if (!desiredNames.has(m.name) && !isTestObject(m.name)) {
      console.log(
        `  ! ${EXECUTE ? "Archiving" : "[DRYRUN] Would archive"} stale metric: ${m.name} (${m.id})`
      );
      if (EXECUTE) {
        await client.v1.billableMetrics.archive({ id: m.id });
      }
    }
  }

  for (const desired of METRICS) {
    const ex = byName.get(desired.name);
    const sortGroupKeys = (keys: string[][]) =>
      [...keys].sort((a, b) => a.join(",").localeCompare(b.join(",")));
    const groupKeysMatch =
      JSON.stringify(sortGroupKeys(ex?.group_keys ?? [])) ===
      JSON.stringify(sortGroupKeys(desired.group_keys ?? []));
    const eventTypeMatch =
      JSON.stringify(ex?.event_type_filter?.in_values?.sort() ?? []) ===
      JSON.stringify([...desired.event_type_filter.in_values].sort());
    const sortFilters = (
      filters: Array<{
        name: string;
        exists?: boolean;
        in_values?: string[];
      }>
    ) => [...filters].sort((a, b) => a.name.localeCompare(b.name));
    const propertyFiltersMatch =
      JSON.stringify(sortFilters(ex?.property_filters ?? [])) ===
      JSON.stringify(sortFilters(desired.property_filters ?? []));
    const configMatch =
      ex &&
      ex.aggregation_key === desired.aggregation_key &&
      ex.aggregation_type?.toLowerCase() ===
        desired.aggregation_type.toLowerCase() &&
      groupKeysMatch &&
      eventTypeMatch &&
      propertyFiltersMatch;

    if (ex && configMatch) {
      console.log(`  ✓ ${desired.name} — up to date (${ex.id})`);
      ids.metrics[desired.name] = ex.id;
    } else {
      if (ex) {
        if (ex.aggregation_key !== desired.aggregation_key) {
          console.log(
            `    [diff] ${desired.name}: aggregation_key ${ex.aggregation_key} → ${desired.aggregation_key}`
          );
        }
        if (
          ex.aggregation_type?.toLowerCase() !==
          desired.aggregation_type.toLowerCase()
        ) {
          console.log(
            `    [diff] ${desired.name}: aggregation_type ${ex.aggregation_type} → ${desired.aggregation_type}`
          );
        }
        if (!groupKeysMatch) {
          console.log(
            `    [diff] ${desired.name}: group_keys ${JSON.stringify(sortGroupKeys(ex.group_keys ?? []))} → ${JSON.stringify(sortGroupKeys(desired.group_keys ?? []))}`
          );
        }
        if (!eventTypeMatch) {
          console.log(
            `    [diff] ${desired.name}: event_type_filter ${JSON.stringify(ex.event_type_filter?.in_values?.sort() ?? [])} → ${JSON.stringify([...desired.event_type_filter.in_values].sort())}`
          );
        }
        if (!propertyFiltersMatch) {
          console.log(
            `    [diff] ${desired.name}: property_filters ${JSON.stringify(sortFilters(ex.property_filters ?? []))} → ${JSON.stringify(sortFilters(desired.property_filters ?? []))}`
          );
        }
        console.log(
          `  ↻ ${desired.name} — config changed${EXECUTE ? ", archiving" : ""} ${ex.id}`
        );
        if (EXECUTE) {
          await client.v1.billableMetrics.archive({ id: ex.id });
        }
      }
      if (EXECUTE) {
        console.log(`  + Creating: ${desired.name}`);
        const created = await client.v1.billableMetrics.create(
          desired as Parameters<typeof client.v1.billableMetrics.create>[0]
        );
        const id = (created as { data: { id: string } }).data.id;
        console.log(`    → ${id}`);
        ids.metrics[desired.name] = id;
      } else {
        console.log(`  + [DRYRUN] Would create: ${desired.name}`);
        // Use existing ID if available (for cascading checks), otherwise placeholder.
        ids.metrics[desired.name] = ex?.id ?? `dryrun-${desired.name}`;
      }
      recreated.metrics.add(desired.name);
    }
  }
}

// ---------------------------------------------------------------------------
// Sync: Products
// ---------------------------------------------------------------------------

function arraysEqual(a?: string[], b?: string[]): boolean {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function productMatches(
  ex: {
    id: string;
    type: string;
    current?: {
      billable_metric_id?: string;
      pricing_group_key?: string[];
      presentation_group_key?: string[];
      tags?: string[];
      quantity_conversion?: {
        conversion_factor: number;
        operation: string;
      } | null;
      quantity_rounding?: {
        decimal_places: number;
        rounding_method: string;
      } | null;
    };
  },
  desired: ProductDef
): boolean {
  const cur = ex.current;
  if (!cur) {
    console.log(`    [diff] ${desired.name}: no current revision`);
    return false;
  }

  if (ex.type !== desired.type) {
    console.log(
      `    [diff] ${desired.name}: type ${ex.type} → ${desired.type}`
    );
    return false;
  }

  const expectedMetricId = desired.billable_metric_name
    ? ids.metrics[desired.billable_metric_name]
    : undefined;
  if (expectedMetricId && cur.billable_metric_id !== expectedMetricId) {
    console.log(
      `    [diff] ${desired.name}: billable_metric_id ${cur.billable_metric_id} → ${expectedMetricId}`
    );
    return false;
  }
  if (!expectedMetricId && cur.billable_metric_id) {
    console.log(
      `    [diff] ${desired.name}: billable_metric_id ${cur.billable_metric_id} should be unset`
    );
    return false;
  }

  const desiredQc = desired.quantity_conversion;
  const existingQc = cur.quantity_conversion;
  if (desiredQc && existingQc) {
    if (
      desiredQc.conversion_factor !== existingQc.conversion_factor ||
      desiredQc.operation.toUpperCase() !== existingQc.operation.toUpperCase()
    ) {
      console.log(
        `    [diff] ${desired.name}: quantity_conversion ${JSON.stringify(existingQc)} → ${JSON.stringify(desiredQc)}`
      );
      return false;
    }
  } else if (!!desiredQc !== !!existingQc) {
    console.log(
      `    [diff] ${desired.name}: quantity_conversion presence ${!!existingQc} → ${!!desiredQc}`
    );
    return false;
  }

  const desiredQr = desired.quantity_rounding;
  const existingQr = cur.quantity_rounding;
  if (desiredQr && existingQr) {
    if (
      desiredQr.decimal_places !== existingQr.decimal_places ||
      desiredQr.rounding_method.toUpperCase() !==
        existingQr.rounding_method.toUpperCase()
    ) {
      console.log(
        `    [diff] ${desired.name}: quantity_rounding ${JSON.stringify(existingQr)} → ${JSON.stringify(desiredQr)}`
      );
      return false;
    }
  } else if (!!desiredQr !== !!existingQr) {
    console.log(
      `    [diff] ${desired.name}: quantity_rounding presence ${!!existingQr} → ${!!desiredQr}`
    );
    return false;
  }

  if (!arraysEqual(cur.pricing_group_key, desired.pricing_group_key)) {
    console.log(
      `    [diff] ${desired.name}: pricing_group_key [${cur.pricing_group_key ?? ""}] → [${desired.pricing_group_key ?? ""}]`
    );
    return false;
  }
  if (
    !arraysEqual(cur.presentation_group_key, desired.presentation_group_key)
  ) {
    console.log(
      `    [diff] ${desired.name}: presentation_group_key [${cur.presentation_group_key ?? ""}] → [${desired.presentation_group_key ?? ""}]`
    );
    return false;
  }

  if (
    !arraysEqual([...(cur.tags ?? [])].sort(), [...(desired.tags ?? [])].sort())
  ) {
    console.log(
      `    [diff] ${desired.name}: tags [${cur.tags ?? ""}] → [${desired.tags ?? ""}]`
    );
    return false;
  }

  return true;
}

// Returns true when any product was created, archived, or had its
// `custom_fields` updated — i.e. the cached `productId → seatType` map in
// Redis is now stale and needs invalidating. Returns false on a no-op run so
// `main()` can skip the Redis call entirely.
async function syncProducts(): Promise<boolean> {
  console.log("\n=== Syncing Products ===");

  let mutated = false;

  interface ExistingProduct {
    id: string;
    type: string;
    current?: {
      name: string;
      billable_metric_id?: string;
      pricing_group_key?: string[];
      presentation_group_key?: string[];
      quantity_conversion?: {
        conversion_factor: number;
        operation: string;
      } | null;
      quantity_rounding?: {
        decimal_places: number;
        rounding_method: string;
      } | null;
    };
    custom_fields?: Record<string, string>;
  }

  const existing: ExistingProduct[] = [];
  for await (const p of client.v1.contracts.products.list()) {
    existing.push(p as ExistingProduct);
  }

  const byName = new Map(existing.map((p) => [p.current?.name ?? "", p]));
  const desiredNames = new Set(PRODUCTS.map((p) => p.name));

  for (const p of existing) {
    const name = p.current?.name ?? "";
    if (!desiredNames.has(name) && !isTestObject(name)) {
      console.log(
        `  ! ${EXECUTE ? "Archiving" : "[DRYRUN] Would archive"} stale product: ${name} (${p.id})`
      );
      if (EXECUTE) {
        try {
          await client.v1.contracts.products.archive({ product_id: p.id });
          mutated = true;
        } catch {
          console.log(`    (archive failed — may have active references)`);
        }
      }
    }
  }

  for (const desired of PRODUCTS) {
    const ex = byName.get(desired.name);

    const isUpToDate = ex && productMatches(ex, desired);

    if (isUpToDate) {
      console.log(`  ✓ ${desired.name} — up to date (${ex.id})`);
      ids.products[desired.name] = ex.id;
      if (await reconcileProductCustomFields(ex, desired)) {
        mutated = true;
      }
    } else {
      if (ex) {
        console.log(
          `  ↻ ${desired.name} — config changed${EXECUTE ? ", archiving" : ""} ${ex.id}`
        );
        if (EXECUTE) {
          try {
            await client.v1.contracts.products.archive({ product_id: ex.id });
            mutated = true;
          } catch {
            console.log(`    (archive failed)`);
          }
        }
      }

      if (EXECUTE) {
        const metricId = desired.billable_metric_name
          ? ids.metrics[desired.billable_metric_name]
          : undefined;
        if (desired.billable_metric_name && !metricId) {
          throw new Error(`Metric not found: ${desired.billable_metric_name}`);
        }

        console.log(`  + Creating: ${desired.name}`);
        const created = await client.v1.contracts.products.create({
          name: desired.name,
          type: desired.type,
          billable_metric_id: metricId,
          quantity_conversion: desired.quantity_conversion ?? undefined,
          quantity_rounding: desired.quantity_rounding ?? undefined,
          pricing_group_key: desired.pricing_group_key,
          presentation_group_key: desired.presentation_group_key,
          tags: desired.tags,
          custom_fields: desired.custom_fields,
        });
        const id = (created as { data: { id: string } }).data.id;
        console.log(`    → ${id}`);
        ids.products[desired.name] = id;
        mutated = true;
      } else {
        console.log(`  + [DRYRUN] Would create: ${desired.name}`);
        ids.products[desired.name] = ex?.id ?? `dryrun-${desired.name}`;
      }
      recreated.products.add(desired.name);
    }
  }

  return mutated;
}

/**
 * Reconcile `custom_fields` on an existing product via `setValues` — drift on
 * custom fields alone never triggers a product recreate (and the matching
 * predicate above intentionally ignores them).
 *
 * Returns true when an update was actually applied (EXECUTE + drift detected)
 * so the caller can flag the product-seat-type cache as stale.
 */
async function reconcileProductCustomFields(
  ex: { id: string; custom_fields?: Record<string, string> },
  desired: ProductDef
): Promise<boolean> {
  const desiredCfs = desired.custom_fields;
  if (!desiredCfs || Object.keys(desiredCfs).length === 0) {
    return false;
  }
  const existingCfs = ex.custom_fields ?? {};
  const drift: Record<string, string> = {};
  for (const [key, value] of Object.entries(desiredCfs)) {
    if (existingCfs[key] !== value) {
      drift[key] = value;
    }
  }
  if (Object.keys(drift).length === 0) {
    return false;
  }
  console.log(
    `  ✎ ${EXECUTE ? "Updating" : "[DRYRUN] Would update"} ${desired.name} custom_fields ${JSON.stringify(drift)}`
  );
  if (EXECUTE) {
    await client.v1.customFields.setValues({
      entity: "contract_product",
      entity_id: ex.id,
      custom_fields: drift,
    });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Sync: Rate Cards
// ---------------------------------------------------------------------------

async function rateCardMatches(
  ex: ExistingRateCard,
  desired: RateCardDef
): Promise<boolean> {
  if (ex.description !== desired.description) {
    console.log(`    [diff] ${ex.name}: description changed`);
    return false;
  }
  if (ex.fiat_credit_type?.id !== desired.fiat_credit_type_id) {
    console.log(
      `    [diff] ${ex.name}: fiat_credit_type ${ex.fiat_credit_type?.id} → ${desired.fiat_credit_type_id}`
    );
    return false;
  }

  // Compare aliases
  const exAliases = (ex.aliases ?? []).map((a) => a.name).sort();
  const desiredAliases = desired.aliases.map((a) => a.name).sort();
  if (!arraysEqual(exAliases, desiredAliases)) {
    console.log(
      `    [diff] ${ex.name}: aliases [${exAliases}] → [${desiredAliases}]`
    );
    return false;
  }

  // Compare credit type conversions
  const exConvs = (ex.credit_type_conversions ?? [])
    .map((c) => `${c.custom_credit_type?.id}:${c.fiat_per_custom_credit}`)
    .sort();
  const desiredConvs = (desired.credit_type_conversions ?? [])
    .map((c) => `${c.custom_credit_type_id}:${c.fiat_per_custom_credit}`)
    .sort();
  if (!arraysEqual(exConvs, desiredConvs)) {
    console.log(
      `    [diff] ${ex.name}: credit_type_conversions [${exConvs}] → [${desiredConvs}]`
    );
    return false;
  }

  // Check if any referenced product was recreated
  if (desired.rates.some((r) => recreated.products.has(r.product_name))) {
    const recreatedProducts = desired.rates
      .filter((r) => recreated.products.has(r.product_name))
      .map((r) => r.product_name);
    console.log(
      `    [diff] ${ex.name}: products recreated: ${recreatedProducts.join(", ")}`
    );
    return false;
  }

  // Compare actual rates on the rate card.
  const existingRates: Array<{
    product_id?: string;
    entitled?: boolean;
    billing_frequency?: string;
    pricing_group_values?: Record<string, string>;
    rate?: {
      price?: number;
      credit_type?: { id: string };
    };
  }> = [];
  for await (const rate of client.v1.contracts.rateCards.rates.list({
    rate_card_id: ex.id,
    at: new Date().toISOString(),
  })) {
    existingRates.push(rate as (typeof existingRates)[number]);
  }

  if (existingRates.length !== desired.rates.length) {
    console.log(
      `    [diff] ${ex.name}: rate count ${existingRates.length} → ${desired.rates.length}`
    );
    return false;
  }

  // Stable serialization of pricing_group_values so two rates on the same
  // product but different group values can be told apart.
  const serializeGroupValues = (v?: Record<string, string>): string =>
    JSON.stringify(
      Object.fromEntries(
        Object.entries(v ?? {}).sort(([a], [b]) => a.localeCompare(b))
      )
    );

  for (const desiredRate of desired.rates) {
    const productId = ids.products[desiredRate.product_name];
    const desiredGroupKey = serializeGroupValues(
      desiredRate.pricing_group_values
    );
    const match = existingRates.find(
      (r) =>
        r.product_id === productId &&
        serializeGroupValues(r.pricing_group_values) === desiredGroupKey
    );
    if (!match) {
      console.log(
        `    [diff] ${ex.name}: product ${desiredRate.product_name} (${productId}) with group_values ${desiredGroupKey} not found in existing rates`
      );
      return false;
    }
    if (match.rate?.price !== desiredRate.price) {
      console.log(
        `    [diff] ${ex.name}: ${desiredRate.product_name} price ${match.rate?.price} → ${desiredRate.price}`
      );
      return false;
    }
    if (match.entitled !== desiredRate.entitled) {
      console.log(
        `    [diff] ${ex.name}: ${desiredRate.product_name} entitled ${match.entitled} → ${desiredRate.entitled}`
      );
      return false;
    }
    if (
      desiredRate.credit_type_id &&
      match.rate?.credit_type?.id !== desiredRate.credit_type_id
    ) {
      console.log(
        `    [diff] ${ex.name}: ${desiredRate.product_name} credit_type ${match.rate?.credit_type?.id} → ${desiredRate.credit_type_id}`
      );
      return false;
    }
    if (
      desiredRate.billing_frequency &&
      match.billing_frequency !== desiredRate.billing_frequency
    ) {
      console.log(
        `    [diff] ${ex.name}: ${desiredRate.product_name} billing_frequency ${match.billing_frequency} → ${desiredRate.billing_frequency}`
      );
      return false;
    }
  }

  return true;
}

interface ExistingRateCard {
  id: string;
  name: string;
  description?: string;
  fiat_credit_type?: { id: string; name: string };
  aliases?: Array<{ name: string }>;
  credit_type_conversions?: Array<{
    custom_credit_type?: { id: string; name: string };
    fiat_per_custom_credit: string;
  }>;
  custom_fields?: Record<string, string>;
}

async function syncRateCards(): Promise<void> {
  console.log("\n=== Syncing Rate Cards ===");

  const rateCards = getRateCards();

  const existing: ExistingRateCard[] = [];
  for await (const r of client.v1.contracts.rateCards.list({ body: {} })) {
    existing.push(r as ExistingRateCard);
  }

  const byName = new Map(existing.map((r) => [r.name, r]));
  const desiredNames = new Set(rateCards.map((r) => r.name));

  for (const r of existing) {
    if (!desiredNames.has(r.name) && !isTestObject(r.name)) {
      console.log(
        `  ! ${EXECUTE ? "Archiving" : "[DRYRUN] Would archive"} stale rate card: ${r.name} (${r.id})`
      );
      if (EXECUTE) {
        try {
          await client.v1.contracts.rateCards.archive({ id: r.id });
        } catch {
          console.log(`    (archive failed)`);
        }
      }
    }
  }

  for (const desired of rateCards) {
    const ex = byName.get(desired.name);

    if (ex && (await rateCardMatches(ex, desired))) {
      console.log(`  ✓ ${desired.name} — up to date (${ex.id})`);
      ids.rateCards[desired.name] = ex.id;
    } else {
      if (ex) {
        console.log(
          `  ↻ ${desired.name} — config changed${EXECUTE ? ", archiving" : ""} ${ex.id}`
        );
        if (EXECUTE) {
          try {
            await client.v1.contracts.rateCards.archive({ id: ex.id });
          } catch {
            console.log(`    (archive failed)`);
          }
        }
      }

      if (EXECUTE) {
        console.log(`  + Creating: ${desired.name}`);
        const created = await client.v1.contracts.rateCards.create({
          name: desired.name,
          description: desired.description,
          aliases: desired.aliases,
          fiat_credit_type_id: desired.fiat_credit_type_id,
          credit_type_conversions: desired.credit_type_conversions,
        });
        const id = (created as { data: { id: string } }).data.id;
        console.log(`    → ${id}`);
        ids.rateCards[desired.name] = id;

        // Add rates (one at a time — SDK takes a single rate per call)
        console.log(`    Adding ${desired.rates.length} rates...`);
        for (const r of desired.rates) {
          const productId = ids.products[r.product_name];
          if (!productId) {
            throw new Error(`Product not found: ${r.product_name}`);
          }
          await client.v1.contracts.rateCards.rates.add({
            rate_card_id: id,
            product_id: productId,
            starting_at: r.starting_at,
            entitled: r.entitled,
            rate_type: r.rate_type as "FLAT",
            price: r.price,
            credit_type_id: r.credit_type_id,
            pricing_group_values: r.pricing_group_values,
            billing_frequency: r.billing_frequency as
              | "MONTHLY"
              | "QUARTERLY"
              | "ANNUAL"
              | "WEEKLY"
              | undefined,
          });
        }
      } else {
        console.log(
          `  + [DRYRUN] Would create: ${desired.name} (${desired.rates.length} rates)`
        );
        ids.rateCards[desired.name] = ex?.id ?? `dryrun-${desired.name}`;
      }

      recreated.rateCards.add(desired.name);
    }
  }
}

// ---------------------------------------------------------------------------
// Sync: Packages
// ---------------------------------------------------------------------------

interface ExistingPackage {
  id: string;
  name: string;
  contract_name?: string;
  aliases?: Array<{ name: string }>;
  rate_card_id?: string;
  scheduled_charges_on_usage_invoices?: "ALL";
  subscriptions?: Array<{
    collection_schedule: string;
    proration: {
      invoice_behavior: string;
      is_prorated: boolean;
    };
    subscription_rate: {
      billing_frequency: string;
      product?: { id: string };
      product_id?: string;
    };
    quantity_management_mode?: string;
    seat_config?: { seat_group_key: string };
    initial_quantity?: number;
  }>;
  recurring_credits?: Array<{
    product: { id: string };
    access_amount: {
      credit_type_id: string;
      unit_price: number;
      quantity?: number;
    };
    commit_duration: { value: number };
    priority: number;
    starting_at_offset: { unit: string; value: number };
    applicable_product_tags?: string[];
    recurrence_frequency?: string;
    name?: string;
    // Metronome returns the resolved subscription identifier (post-create) plus
    // the allocation mode for credits attached to a SEAT_BASED subscription.
    subscription_config?: {
      allocation?: "INDIVIDUAL" | "POOLED";
    };
  }>;
  overrides?: Array<{
    entitled?: boolean;
    type?: string;
    override_specifiers?: Array<{
      product_id?: string;
      billing_frequency?: string;
    }>;
    overwrite_rate?: {
      rate_type?: string;
      price?: number;
      credit_type?: { id: string };
    };
    product?: { id: string };
  }>;
}

function packageMatches(ex: ExistingPackage, desired: PackageDef): boolean {
  if (recreated.rateCards.has(desired.rate_card_name)) {
    console.log(
      `    [diff] ${desired.name}: rate card "${desired.rate_card_name}" recreated this run`
    );
    return false;
  }

  const expectedRateCardId = ids.rateCards[desired.rate_card_name];
  if (expectedRateCardId && ex.rate_card_id !== expectedRateCardId) {
    console.log(
      `    [diff] ${desired.name}: rate_card_id ${ex.rate_card_id} → ${expectedRateCardId}`
    );
    return false;
  }

  const desiredSubs = desired.subscriptions ?? [];
  const existingSubs = ex.subscriptions ?? [];
  if (desiredSubs.length !== existingSubs.length) {
    console.log(
      `    [diff] ${desired.name}: subscription count ${existingSubs.length} → ${desiredSubs.length}`
    );
    return false;
  }

  for (const desiredSub of desiredSubs) {
    const productId = ids.products[desiredSub.product_name];
    const matchingSub = existingSubs.find(
      (s) =>
        (s.subscription_rate.product?.id ?? s.subscription_rate.product_id) ===
        productId
    );
    if (!matchingSub) {
      console.log(
        `    [diff] ${desired.name}: subscription product ${desiredSub.product_name} (${productId}) not found`
      );
      return false;
    }
    if (matchingSub.collection_schedule !== desiredSub.collection_schedule) {
      console.log(
        `    [diff] ${desired.name}: ${desiredSub.product_name} collection_schedule ${matchingSub.collection_schedule} → ${desiredSub.collection_schedule}`
      );
      return false;
    }
    if (
      matchingSub.subscription_rate.billing_frequency !==
      desiredSub.billing_frequency
    ) {
      console.log(
        `    [diff] ${desired.name}: ${desiredSub.product_name} billing_frequency ${matchingSub.subscription_rate.billing_frequency} → ${desiredSub.billing_frequency}`
      );
      return false;
    }
    if (desiredSub.proration) {
      if (
        matchingSub.proration.is_prorated !== desiredSub.proration.is_prorated
      ) {
        console.log(
          `    [diff] ${desired.name}: ${desiredSub.product_name} proration.is_prorated ${matchingSub.proration.is_prorated} → ${desiredSub.proration.is_prorated}`
        );
        return false;
      }
      if (
        desiredSub.proration.invoice_behavior &&
        matchingSub.proration.invoice_behavior !==
          desiredSub.proration.invoice_behavior
      ) {
        console.log(
          `    [diff] ${desired.name}: ${desiredSub.product_name} proration.invoice_behavior ${matchingSub.proration.invoice_behavior} → ${desiredSub.proration.invoice_behavior}`
        );
        return false;
      }
    }
    if (
      desiredSub.quantity_management_mode &&
      matchingSub.quantity_management_mode !==
        desiredSub.quantity_management_mode
    ) {
      console.log(
        `    [diff] ${desired.name}: ${desiredSub.product_name} quantity_management_mode ${matchingSub.quantity_management_mode} → ${desiredSub.quantity_management_mode}`
      );
      return false;
    }
    if (
      (desiredSub.initial_quantity ?? undefined) !==
      (matchingSub.initial_quantity ?? undefined)
    ) {
      console.log(
        `    [diff] ${desired.name}: ${desiredSub.product_name} initial_quantity ${matchingSub.initial_quantity} → ${desiredSub.initial_quantity}`
      );
      return false;
    }
    if (
      (desiredSub.seat_config?.seat_group_key ?? undefined) !==
      (matchingSub.seat_config?.seat_group_key ?? undefined)
    ) {
      console.log(
        `    [diff] ${desired.name}: ${desiredSub.product_name} seat_config.seat_group_key ${matchingSub.seat_config?.seat_group_key} → ${desiredSub.seat_config?.seat_group_key}`
      );
      return false;
    }
  }

  if (
    (desired.scheduled_charges_on_usage_invoices ?? undefined) !==
    (ex.scheduled_charges_on_usage_invoices ?? undefined)
  ) {
    console.log(
      `    [diff] ${desired.name}: scheduled_charges_on_usage_invoices ${ex.scheduled_charges_on_usage_invoices} → ${desired.scheduled_charges_on_usage_invoices}`
    );
    return false;
  }

  const desiredCredits = desired.recurring_credits ?? [];
  const existingCredits = ex.recurring_credits ?? [];
  if (desiredCredits.length !== existingCredits.length) {
    console.log(
      `    [diff] ${desired.name}: recurring_credits count ${existingCredits.length} → ${desiredCredits.length}`
    );
    return false;
  }
  for (const desiredCredit of desiredCredits) {
    const productId = ids.products[desiredCredit.product_name];
    // Match by `name` — multiple recurring credits can share the same product
    // (e.g. Free Monthly + Free Excess both reference the "Free Credits" product),
    // so product_id alone is not a unique key.
    const match = existingCredits.find((c) => c.name === desiredCredit.name);
    if (!match) {
      console.log(
        `    [diff] ${desired.name}: recurring credit "${desiredCredit.name}" not found`
      );
      return false;
    }
    if (match.product.id !== productId) {
      console.log(
        `    [diff] ${desired.name}: recurring credit "${desiredCredit.name}" product_id ${match.product.id} → ${productId}`
      );
      return false;
    }
    if (
      match.access_amount.credit_type_id !==
      desiredCredit.access_amount.credit_type_id
    ) {
      console.log(
        `    [diff] ${desired.name}: recurring credit "${desiredCredit.name}" credit_type_id ${match.access_amount.credit_type_id} → ${desiredCredit.access_amount.credit_type_id}`
      );
      return false;
    }
    if (match.priority !== desiredCredit.priority) {
      console.log(
        `    [diff] ${desired.name}: recurring credit "${desiredCredit.name}" priority ${match.priority} → ${desiredCredit.priority}`
      );
      return false;
    }
    if (
      (match.recurrence_frequency ?? undefined) !==
      (desiredCredit.recurrence_frequency ?? undefined)
    ) {
      console.log(
        `    [diff] ${desired.name}: recurring credit "${desiredCredit.name}" recurrence_frequency ${match.recurrence_frequency} → ${desiredCredit.recurrence_frequency}`
      );
      return false;
    }
    // Compare subscription_config presence and allocation mode. We can't match
    // the subscription_id directly (the existing credit holds a resolved ID
    // while the desired def references a temporary_id), but the allocation mode
    // changing is enough to force recreation.
    const desiredAllocation = desiredCredit.subscription_config?.allocation;
    const existingAllocation = match.subscription_config?.allocation;
    if (desiredAllocation !== existingAllocation) {
      console.log(
        `    [diff] ${desired.name}: recurring credit "${desiredCredit.name}" subscription allocation ${existingAllocation} → ${desiredAllocation}`
      );
      return false;
    }
  }

  const desiredOverrides = desired.overrides ?? [];
  const existingOverrides = ex.overrides ?? [];
  if (desiredOverrides.length !== existingOverrides.length) {
    console.log(
      `    [diff] ${desired.name}: overrides count ${existingOverrides.length} → ${desiredOverrides.length}`
    );
    return false;
  }
  for (const desiredOverride of desiredOverrides) {
    const productId = ids.products[desiredOverride.product_name];
    const match = existingOverrides.find(
      (o) =>
        (o.product?.id ?? o.override_specifiers?.[0]?.product_id) === productId
    );
    if (!match) {
      console.log(
        `    [diff] ${desired.name}: override for ${desiredOverride.product_name} (${productId}) not found`
      );
      return false;
    }
    if ((match.entitled ?? false) !== desiredOverride.entitled) {
      console.log(
        `    [diff] ${desired.name}: override ${desiredOverride.product_name} entitled ${match.entitled} → ${desiredOverride.entitled}`
      );
      return false;
    }
  }

  return true;
}

async function syncPackages(): Promise<void> {
  console.log("\n=== Syncing Packages ===");

  const existing: ExistingPackage[] = [];
  for await (const p of client.v1.packages.list()) {
    existing.push(p as ExistingPackage);
  }

  // Build a map from alias → existing package (a package may have multiple aliases).
  const byAlias = new Map<string, ExistingPackage>();
  for (const p of existing) {
    for (const alias of p.aliases ?? []) {
      byAlias.set(alias.name, p);
    }
  }

  const packages = getPackages();

  // Collect all desired aliases to identify stale packages.
  const desiredAliases = new Set(
    packages.flatMap((p) => p.aliases.map((a) => a.name))
  );

  // Archive packages whose aliases are not in the desired set (and not test objects).
  for (const p of existing) {
    const aliases = (p.aliases ?? []).map((a) => a.name);
    const isDesired = aliases.some((a) => desiredAliases.has(a));
    if (!isDesired && !isTestObject(p.name)) {
      console.log(
        `  ! ${EXECUTE ? "Archiving" : "[DRYRUN] Would archive"} stale package: ${p.name} (${p.id})`
      );
      if (EXECUTE) {
        try {
          await client.v1.packages.archive({ package_id: p.id });
        } catch {
          console.log(`    (archive failed — may have active contracts)`);
        }
      }
    }
  }

  for (const desired of packages) {
    // Find existing package by alias (not name — name changes on version bumps).
    const primaryAlias = desired.aliases[0]?.name;
    const ex = primaryAlias ? byAlias.get(primaryAlias) : undefined;

    // Extract current version from existing package name (e.g., "Legacy Pro USD v3" → 3).
    const existingVersion = ex?.name
      ? parseInt(ex.name.match(/\sv(\d+)$/)?.[1] ?? "0", 10)
      : 0;

    if (ex && packageMatches(ex, desired)) {
      // Up to date — keep existing version.
      const versionedName = `${desired.name} v${existingVersion || 1}`;
      console.log(`  ✓ ${versionedName} — up to date (${ex.id})`);
      ids.packages[desired.name] = ex.id;
    } else {
      // Needs recreation — increment version.
      const newVersion = existingVersion + 1;
      const versionedName = `${desired.name} v${newVersion}`;

      if (ex) {
        console.log(
          `  ↻ ${versionedName} — config changed${EXECUTE ? ", archiving" : ""} ${ex.name} (${ex.id})`
        );
        if (EXECUTE) {
          try {
            await client.v1.packages.archive({ package_id: ex.id });
          } catch {
            console.log(`    (archive failed)`);
          }
        }
      }

      if (EXECUTE) {
        const rateCardId = ids.rateCards[desired.rate_card_name];
        if (!rateCardId) {
          throw new Error(`Rate card not found: ${desired.rate_card_name}`);
        }

        console.log(`  + Creating: ${versionedName}`);
        // Resolve subscription product IDs
        const subscriptions = (desired.subscriptions ?? []).map((sub) => {
          const productId = ids.products[sub.product_name];
          if (!productId) {
            throw new Error(
              `Product not found for subscription: ${sub.product_name}`
            );
          }
          return {
            temporary_id: sub.temporary_id,
            subscription_rate: {
              billing_frequency: sub.billing_frequency,
              product_id: productId,
            },
            collection_schedule: sub.collection_schedule,
            quantity_management_mode: sub.quantity_management_mode,
            ...(sub.seat_config ? { seat_config: sub.seat_config } : {}),
            ...(sub.initial_quantity !== undefined
              ? { initial_quantity: sub.initial_quantity }
              : {}),
            ...(sub.proration ? { proration: sub.proration } : {}),
          };
        });

        // Resolve recurring credit product IDs
        const recurringCredits = (desired.recurring_credits ?? []).map(
          (credit) => {
            const productId = ids.products[credit.product_name];
            if (!productId) {
              throw new Error(
                `Product not found for recurring credit: ${credit.product_name}`
              );
            }
            // For credits attached to a SEAT_BASED subscription via
            // subscription_config, Metronome's `subscription_id` field in the
            // package payload accepts the `temporary_id` of the Subscription
            // declared in the same payload.
            const subscriptionConfig = credit.subscription_config
              ? {
                  subscription_id:
                    credit.subscription_config.subscription_temporary_id,
                  allocation: credit.subscription_config.allocation,
                  apply_seat_increase_config:
                    credit.subscription_config.apply_seat_increase_config,
                }
              : undefined;
            return {
              product_id: productId,
              access_amount: credit.access_amount,
              commit_duration: credit.commit_duration,
              priority: credit.priority,
              starting_at_offset: credit.starting_at_offset,
              ...(credit.applicable_product_tags
                ? { applicable_product_tags: credit.applicable_product_tags }
                : {}),
              ...(credit.specifiers ? { specifiers: credit.specifiers } : {}),
              ...(credit.recurrence_frequency
                ? { recurrence_frequency: credit.recurrence_frequency }
                : {}),
              ...(credit.duration ? { duration: credit.duration } : {}),
              ...(credit.name ? { name: credit.name } : {}),
              ...(subscriptionConfig
                ? { subscription_config: subscriptionConfig }
                : {}),
            };
          }
        );

        const overrides = (desired.overrides ?? []).map((o) => {
          const productId = ids.products[o.product_name];
          if (!productId) {
            throw new Error(
              `Product not found for override: ${o.product_name}`
            );
          }
          return {
            starting_at_offset: { unit: "DAYS" as const, value: 0 },
            entitled: o.entitled,
            override_specifiers: [{ product_id: productId }],
          };
        });

        const created = await client.v1.packages.create({
          name: versionedName,
          contract_name: versionedName,
          aliases: desired.aliases,
          rate_card_id: rateCardId,
          billing_anchor_date: desired.billing_anchor_date,
          ...(desired.usage_statement_schedule
            ? { usage_statement_schedule: desired.usage_statement_schedule }
            : {}),
          ...(subscriptions.length > 0 ? { subscriptions } : {}),
          ...(recurringCredits.length > 0
            ? { recurring_credits: recurringCredits }
            : {}),
          ...(overrides.length > 0 ? { overrides } : {}),
          ...(desired.scheduled_charges_on_usage_invoices
            ? {
                scheduled_charges_on_usage_invoices:
                  desired.scheduled_charges_on_usage_invoices,
              }
            : {}),
        } as Parameters<typeof client.v1.packages.create>[0]);
        const id = (created as { data: { id: string } }).data.id;
        console.log(`    → ${id}`);
        ids.packages[desired.name] = id;
      } else {
        console.log(`  + [DRYRUN] Would create: ${versionedName}`);
        ids.packages[desired.name] = ex?.id ?? `dryrun-${desired.name}`;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Sync: Custom Fields
// ---------------------------------------------------------------------------

const CUSTOM_FIELD_KEYS: Array<{
  entity: "contract" | "contract_product";
  key: string;
}> = [
  { entity: "contract", key: "MAU_TIERS" },
  { entity: "contract", key: "MAU_THRESHOLD" },
  { entity: "contract", key: PLAN_CODE_CUSTOM_FIELD_KEY },
  // Stamped on each seat-style product (Workspace / Pro / Max / Free).
  // Runtime code reads `product.custom_fields.DUST_SEAT_TYPE` (cached in
  // Redis) instead of comparing product names/IDs, which change on every
  // redeploy. Setting it on the product (vs. on every subscription
  // instance) means existing contracts pick up new tags for free, with no
  // per-contract backfill needed.
  //
  // Note: Metronome's custom-fields API uses `contract_product` for the
  // entity type returned by `v1.contracts.products.list()` — `product` is a
  // legacy plan-product type and 404s on these IDs.
  { entity: "contract_product", key: SEAT_TYPE_CUSTOM_FIELD_KEY },
  // Per-product Stripe product ID. Read by Metronome (via the
  // `invoiceitem.price.product` mapping configured in Metronome's Stripe
  // integration settings) when generating Stripe invoices for
  // payment-gated commits. Populated manually in the Metronome UI per
  // product — this entry only registers the field so the UI exposes it.
  { entity: "contract_product", key: STRIPE_PRODUCT_ID_CUSTOM_FIELD_KEY },
];

async function syncCustomFields(): Promise<void> {
  console.log("\n=== Syncing Custom Fields ===");

  const entities = Array.from(new Set(CUSTOM_FIELD_KEYS.map((f) => f.entity)));

  // Track existing keys per entity — the same key can be registered for
  // multiple entities and each registration is independent.
  const existingKeysByEntity = new Map<string, Set<string>>();
  for (const entity of entities) {
    const keys = new Set<string>();
    for await (const entry of client.v1.customFields.listKeys({
      entities: [entity],
    })) {
      keys.add(entry.key);
    }
    existingKeysByEntity.set(entity, keys);
  }

  for (const field of CUSTOM_FIELD_KEYS) {
    const existing = existingKeysByEntity.get(field.entity) ?? new Set();
    if (existing.has(field.key)) {
      console.log(`  ✓ ${field.entity}.${field.key} — already exists`);
    } else {
      console.log(
        `  + ${EXECUTE ? "Creating" : "[DRYRUN] Would create"}: ${field.entity}.${field.key}`
      );
      if (EXECUTE) {
        await client.v1.customFields.addKey({
          entity: field.entity,
          key: field.key,
          enforce_uniqueness: false,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Sync: Alerts (default threshold notifications)
// ---------------------------------------------------------------------------

interface AlertDef {
  name: string;
  alert_type:
    | "low_remaining_contract_credit_balance_reached"
    | "low_remaining_commit_balance_reached"
    | "low_remaining_contract_credit_and_commit_balance_reached";
  threshold: number;
  // Idempotency key — Metronome rejects duplicate creates with the same key.
  uniqueness_key: string;
  // Tag identifying which credit type the threshold tracks. Resolved at sync
  // time (AWU ID differs per environment).
  credit_type: "AWU";
}

// Default alerts applied to all customers (no `customer_id` set on create):
// fire when AWU credit / contract-credit / commit balance reaches 0.
const ALERTS: AlertDef[] = [
  {
    name: "Default: Empty contract credit balance (AWU)",
    alert_type: "low_remaining_contract_credit_balance_reached",
    threshold: 0,
    uniqueness_key: "default-low-contract-credit-balance-zero-awu",
    credit_type: "AWU",
  },
  {
    name: "Default: Empty commit balance (AWU)",
    alert_type: "low_remaining_commit_balance_reached",
    threshold: 0,
    uniqueness_key: "default-low-commit-balance-zero-awu",
    credit_type: "AWU",
  },
  {
    name: "Default: Empty contract credit + commit balance (AWU)",
    alert_type: "low_remaining_contract_credit_and_commit_balance_reached",
    threshold: 0,
    uniqueness_key: "default-low-contract-credit-and-commit-balance-zero-awu",
    credit_type: "AWU",
  },
];

async function syncAlerts(): Promise<void> {
  console.log("\n=== Syncing Alerts ===");

  for (const desired of ALERTS) {
    const creditTypeId =
      desired.credit_type === "AWU" ? getCreditTypeAwuId() : undefined;

    if (!EXECUTE) {
      console.log(
        `  + [DRYRUN] Would create alert: ${desired.name} (${desired.alert_type}, threshold=${desired.threshold})`
      );
      continue;
    }

    try {
      const created = await client.v1.alerts.create({
        name: desired.name,
        alert_type: desired.alert_type,
        threshold: desired.threshold,
        uniqueness_key: desired.uniqueness_key,
        credit_type_id: creditTypeId,
      });
      const id = (created as { data: { id: string } }).data.id;
      console.log(`  + Created: ${desired.name} → ${id}`);
    } catch (err) {
      // Metronome returns 409 when uniqueness_key already exists.
      const status = (err as { status?: number })?.status;
      if (status === 409) {
        console.log(
          `  ✓ ${desired.name} — already exists (uniqueness_key="${desired.uniqueness_key}")`
        );
      } else {
        throw err;
      }
    }
  }
}

async function main(): Promise<void> {
  ENV = await detectEnvironment();
  console.log(
    `Metronome Setup — environment: ${ENV}, mode: ${EXECUTE ? "EXECUTE" : "DRY-RUN (pass --execute to apply)"}\n`
  );

  console.log(
    `Credit types: USD=${CREDIT_TYPE_USD_ID}, AWU=${getCreditTypeAwuId()}, PROG_USD=${getCreditTypeProgrammaticUsdId()}`
  );

  await syncCustomFields();
  await syncMetrics();
  const productsMutated = await syncProducts();
  await syncRateCards();
  await syncPackages();
  await syncAlerts();

  // Drop the cached `productId → seatType` map so live processes pick up
  // tag changes immediately rather than waiting for the 6h TTL. Only needed
  // when products were created, archived, or had custom_fields updated —
  // rate-card / package / alert changes don't affect the map. Skipping the
  // call on no-op runs also avoids the Redis connection error on hosts where
  // Redis isn't reachable.
  if (EXECUTE && productsMutated) {
    try {
      await invalidateProductSeatTypesCache();
      console.log("\n✓ Cleared product seat-type cache");
    } catch (err) {
      console.warn("Failed to invalidate product seat-type cache:", err);
    }
  }

  if (!EXECUTE) {
    console.log("\n✓ Dry-run complete. Pass --execute to apply changes.");
    return;
  }

  console.log("\n=== ID Summary ===");
  for (const [category, map] of Object.entries(ids)) {
    console.log(`\n${category}:`);
    for (const [name, id] of Object.entries(map)) {
      console.log(`  ${name}: ${id}`);
    }
  }

  // Output all IDs as TypeScript constants — paste into lib/metronome/constants.ts.
  function toConstName(prefix: string, name: string): string {
    return `${prefix}_${name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "")}`;
  }

  const envPrefix = ENV === "production" ? "PROD" : "DEV";
  console.log(
    `\n=== TypeScript constants (${ENV}) — paste into lib/metronome/constants.ts ===\n`
  );

  console.log("// Metrics");
  for (const [name, id] of Object.entries(ids.metrics)) {
    console.log(`const ${toConstName(envPrefix + "_METRIC", name)} = "${id}";`);
  }

  console.log("\n// Products");
  for (const [name, id] of Object.entries(ids.products)) {
    console.log(
      `const ${toConstName(envPrefix + "_PRODUCT", name)} = "${id}";`
    );
  }

  console.log("\n✓ Done");
}

void main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
