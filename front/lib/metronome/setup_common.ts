/**
 * Metronome setup — common building blocks shared by the legacy and new-pricing
 * catalogs: the desired-state types, the resolved-environment credit accessors,
 * shared constants, the metric/product catalog, and the generic factories.
 *
 * Pure description: no side effects, never talks to Metronome. The legacy plans
 * live in `setup_legacy.ts`, the new-pricing plans in `setup_new_pricing.ts`,
 * and the reconciliation logic in `scripts/metronome_setup.ts`.
 *
 * Environment: builders that need the AWU / Programmatic-USD credit type ids
 * (which differ between sandbox and production) read the value set once by the
 * setup script via `setMetronomeEnv`.
 */

import {
  AWU_PRICE_PER_CREDIT,
  metronomeAmount,
} from "@app/lib/metronome/amounts";
import {
  DEV_CREDIT_TYPE_AWU_ID,
  DEV_CREDIT_TYPE_PROG_USD_ID,
  PROD_CREDIT_TYPE_AWU_ID,
  PROD_CREDIT_TYPE_PROG_USD_ID,
  SEAT_PRODUCT_YEARLY_SUFFIX,
  SEAT_TYPE_CUSTOM_FIELD_KEY,
} from "@app/lib/metronome/constants";
import { EXCESS_CREDIT_NAME } from "@app/lib/metronome/types";
import type { SupportedCurrency } from "@app/types/currency";

// ---------------------------------------------------------------------------
// Types for desired state definitions
// ---------------------------------------------------------------------------

export interface MetricDef {
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

export interface ProductDef {
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

export interface RateDef {
  product_name: string;
  starting_at: string;
  entitled: boolean;
  rate_type: string;
  price: number;
  billing_frequency?: string;
  credit_type_id?: string;
  pricing_group_values?: Record<string, string>;
}

export interface RateCardDef {
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

export interface PackageSubscription {
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

export interface RecurringCreditDef {
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
// rate card, applied from contract start. All non-legacy rate cards carry every
// seat product at `entitled: false` with a 0 baseline price; each package uses
// overrides to flip on (entitled → true) the seats it sells and stamp their
// flat rate. When `price` is set, an `overwrite_rate` is applied on top of the
// rate-card rate (rate_type FLAT). When `price` is omitted, only `entitled` is
// flipped.
export interface PackageOverrideDef {
  product_name: string;
  entitled: boolean;
  // Optional flat-rate override (in the rate card's fiat unit). Requires
  // `credit_type_id` to identify the pricing unit.
  price?: number;
  credit_type_id?: string;
  // Billing frequency of the targeted rate. Required when overwriting a
  // SUBSCRIPTION product's rate — Metronome rejects a flat-rate overwrite on a
  // subscription product without it.
  billing_frequency?: "MONTHLY" | "ANNUAL";
}

export interface PackageDef {
  // Base name without version suffix. Version is auto-computed at sync time.
  name: string;
  aliases: Array<{ name: string }>;
  rate_card_name: string;
  subscriptions?: PackageSubscription[];
  // Billing cycle anchor. "contract_start_date" anchors periods to the contract
  // start day-of-month; "first_billing_period" aligns them to calendar month
  // boundaries (1st → 1st), leaving a partial first period.
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
// A seat type's monthly + annual subscriptions.
export interface SeatSubscriptionPair {
  monthly: PackageSubscription;
  annual: PackageSubscription;
}

// Environment resolved by the setup script (sandbox vs production), set via
// `setMetronomeEnv` before any builder that needs credit type ids is called.
let ENV: "sandbox" | "production" = "sandbox";

export function setMetronomeEnv(env: "sandbox" | "production"): void {
  ENV = env;
}

// Credit type accessors based on the script-detected ENV (not NODE_ENV).
export function getCreditTypeAwuId(): string {
  return ENV === "sandbox" ? DEV_CREDIT_TYPE_AWU_ID : PROD_CREDIT_TYPE_AWU_ID;
}

export function getCreditTypeProgrammaticUsdId(): string {
  return ENV === "sandbox"
    ? DEV_CREDIT_TYPE_PROG_USD_ID
    : PROD_CREDIT_TYPE_PROG_USD_ID;
}

// Number of pricing tiers for any tiered seat-style product (MAU, future).
// Tier products and rates are derived from the prefix.
const SEAT_TIER_COUNT = 6;

export const getOverageAwuRate = (currency: SupportedCurrency) => {
  return metronomeAmount(AWU_PRICE_PER_CREDIT[currency] * 100, currency) * 2;
};

// Setup-only display names. Runtime code identifies seat-style subscriptions
// via the `DUST_SEAT_TYPE` custom field on the product (see
// SEAT_TYPE_CUSTOM_FIELD_KEY), not by name comparison.
export const WORKSPACE_SEAT_PRODUCT_NAME = "Workspace Seat";
export const PRO_SEAT_PRODUCT_NAME = "Pro Seat";
export const MAX_SEAT_PRODUCT_NAME = "Max Seat";
export const FREE_SEAT_PRODUCT_NAME = "Free Seat";
export const PRO_SEAT_CREDIT_NAME = "Pro Seat Credits";
export const MAX_SEAT_CREDIT_NAME = "Max Seat Credits";
export const FREE_SEAT_CREDIT_NAME = "Free Seat Credits";

// Tag shared by all AI/Tool usage products — use `applicable_product_tags: ["usage"]`
// on credits/commits to apply them to all usage products at once.
export const USAGE_TAG = "usage";

// Tag shared by all seat SUBSCRIPTION products (Workspace / Pro / Max / Free,
// monthly + yearly).
const SEAT_TAG = "seat";

// Billing-frequency tags stamped on seat products alongside SEAT_TAG so credits
// / commits can target a single cadence (e.g. `applicable_product_tags:
// ["seat", "yearly"]`).
const MONTHLY_TAG = "monthly";
const YEARLY_TAG = "yearly";

// Billing cycle config for legacy packages — anchored to the contract start
// date (periods recur on the contract start day-of-month).
export const BILLING_CYCLE_CONFIG = {
  billing_anchor_date: "contract_start_date" as const,
  usage_statement_schedule: {
    frequency: "MONTHLY" as const,
    day: "CONTRACT_START" as const,
  },
};

// Billing cycle config for new-pricing packages — anchored to the first of the
// month. Billing periods (and the usage statement that closes them) align to
// calendar month boundaries (1st → 1st) regardless of when a contract starts;
// the first period is a partial stub from contract start to the next 1st.
export const BILLING_CYCLE_CONFIG_FIRST_OF_MONTH = {
  billing_anchor_date: "first_billing_period" as const,
  usage_statement_schedule: {
    frequency: "MONTHLY" as const,
    day: "FIRST_OF_MONTH" as const,
  },
};

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
export function buildSeatTierRates({
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

export const PRODUCTS: ProductDef[] = [
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
    tags: [SEAT_TAG, MONTHLY_TAG],
  },
  {
    name: WORKSPACE_SEAT_PRODUCT_NAME + SEAT_PRODUCT_YEARLY_SUFFIX,
    type: "SUBSCRIPTION",
    custom_fields: { [SEAT_TYPE_CUSTOM_FIELD_KEY]: "workspace_yearly" },
    tags: [SEAT_TAG, YEARLY_TAG],
  },
  // Pro Seat / Max Seat — SUBSCRIPTION products for the new Business / Enterprise
  // seat-based plans. Used as SEAT_BASED subscriptions in packages with per-seat
  // INDIVIDUAL recurring credits (Pro: 8000 AWU/mo, Max: 40000 AWU/mo).
  {
    name: PRO_SEAT_PRODUCT_NAME,
    type: "SUBSCRIPTION",
    custom_fields: { [SEAT_TYPE_CUSTOM_FIELD_KEY]: "pro" },
    tags: [SEAT_TAG, MONTHLY_TAG],
  },
  {
    name: PRO_SEAT_PRODUCT_NAME + SEAT_PRODUCT_YEARLY_SUFFIX,
    type: "SUBSCRIPTION",
    custom_fields: { [SEAT_TYPE_CUSTOM_FIELD_KEY]: "pro_yearly" },
    tags: [SEAT_TAG, YEARLY_TAG],
  },
  {
    name: MAX_SEAT_PRODUCT_NAME,
    type: "SUBSCRIPTION",
    custom_fields: { [SEAT_TYPE_CUSTOM_FIELD_KEY]: "max" },
    tags: [SEAT_TAG, MONTHLY_TAG],
  },
  {
    name: MAX_SEAT_PRODUCT_NAME + SEAT_PRODUCT_YEARLY_SUFFIX,
    type: "SUBSCRIPTION",
    custom_fields: { [SEAT_TYPE_CUSTOM_FIELD_KEY]: "max_yearly" },
    tags: [SEAT_TAG, YEARLY_TAG],
  },

  // Free Seat — SUBSCRIPTION product priced at $0/seat. Carries a one-shot
  // lifetime AWU credit (300 AWU per seat) so free users have a small drawdown
  // pool without being billed.
  {
    name: FREE_SEAT_PRODUCT_NAME,
    type: "SUBSCRIPTION",
    custom_fields: { [SEAT_TYPE_CUSTOM_FIELD_KEY]: "free" },
    tags: [SEAT_TAG, MONTHLY_TAG],
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
    name: "Seat Subscription Credits",
    type: "FIXED",
  },
];

// Factory for a single seat subscription. All share the same ADVANCE collection
// schedule and prorated billing; they differ only by product, billing
// frequency, and quantity-management mode:
//   - QUANTITY_ONLY (workspace / pooled): quantity set directly, starts at 0.
//   - SEAT_BASED (pro / max / free): seats keyed by `user_id` so usage events
//     draw down only the credits attached to the matching seat; the seat count
//     is driven by add_seat_ids / remove_seat_ids via the contract edit API.
export function makeSeatSubscription({
  temporaryId,
  productName,
  billingFrequency,
  mode,
}: {
  temporaryId: string;
  productName: string;
  billingFrequency: "MONTHLY" | "ANNUAL";
  mode: "QUANTITY_ONLY" | "SEAT_BASED";
}): PackageSubscription {
  return {
    temporary_id: temporaryId,
    product_name: productName,
    billing_frequency: billingFrequency,
    collection_schedule: "ADVANCE",
    quantity_management_mode: mode,
    ...(mode === "QUANTITY_ONLY"
      ? { initial_quantity: 0 }
      : { seat_config: { seat_group_key: "user_id" } }),
    proration: {
      is_prorated: true,
      invoice_behavior: "BILL_ON_NEXT_COLLECTION_DATE",
    },
  };
}

// Factory for a seat type's monthly + annual subscriptions in one call. Temp
// ids are derived as `<base>-sub` / `<base>-annual-sub`. The annual variant
// normally bills a distinct `*_yearly` product (monthly + annual coexist on one
// rate card, so they must be separate products); legacy plans set
// `annualUsesSameProduct` because each legacy rate card carries a single
// frequency and reuses the same product. Free has no annual, so it uses
// makeSeatSubscription directly.
export function makeSeatSubscriptions({
  baseTemporaryId,
  productName,
  mode,
  annualUsesSameProduct = false,
}: {
  baseTemporaryId: string;
  productName: string;
  mode: "QUANTITY_ONLY" | "SEAT_BASED";
  annualUsesSameProduct?: boolean;
}): SeatSubscriptionPair {
  return {
    monthly: makeSeatSubscription({
      temporaryId: `${baseTemporaryId}-sub`,
      productName,
      billingFrequency: "MONTHLY",
      mode,
    }),
    annual: makeSeatSubscription({
      temporaryId: `${baseTemporaryId}-annual-sub`,
      productName: annualUsesSameProduct
        ? productName
        : productName + SEAT_PRODUCT_YEARLY_SUFFIX,
      billingFrequency: "ANNUAL",
      mode,
    }),
  };
}

export function getFreeExcessRecurringCredits(
  creditTypeId: string,
  quantity: number
): RecurringCreditDef {
  return {
    product_name: "Excess Credits",
    access_amount: {
      credit_type_id: creditTypeId,
      unit_price: quantity,
      quantity: 1,
    },
    commit_duration: { value: 1, unit: "PERIODS" },
    priority: 999,
    starting_at_offset: { unit: "DAYS", value: 0 }, // starts immediately
    applicable_product_tags: [USAGE_TAG],
    recurrence_frequency: "MONTHLY",
    name: EXCESS_CREDIT_NAME,
  };
}
