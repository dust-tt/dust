/**
 * Core types for the Metronome billing integration.
 *
 * SDK types (Metronome.V1.*) are used directly for API responses.
 * MetronomeEvent is our own type — stricter than the SDK's UsageIngestParams
 * because we enforce `properties: Record<string, string | number>` (no unknown).
 */

import {
  getCreditTypeProgrammaticUsdId,
  getProductExcessCreditsId,
  getProductFreeCreditId,
} from "@app/lib/metronome/constants";
import type { SupportedCurrency } from "@app/types/currency";
import type { Commit, Credit } from "@metronome/sdk/resources/shared";

// Metronome package aliases for contract provisioning.
// These map to packages configured in the Metronome dashboard.
export const LEGACY_PRO_MONTHLY_PACKAGE_ALIAS = "legacy-pro-monthly";
export const LEGACY_PRO_ANNUAL_PACKAGE_ALIAS = "legacy-pro-annual";
export const LEGACY_BUSINESS_PACKAGE_ALIAS = "legacy-business";
export const LEGACY_ENTERPRISE_PACKAGE_ALIAS = "legacy-enterprise";

// EUR variants — same plans, billed in EUR for Eurozone/EEA/Switzerland customers.
export const LEGACY_PRO_MONTHLY_EUR_PACKAGE_ALIAS = "legacy-pro-monthly-eur";
export const LEGACY_PRO_ANNUAL_EUR_PACKAGE_ALIAS = "legacy-pro-annual-eur";
export const LEGACY_BUSINESS_EUR_PACKAGE_ALIAS = "legacy-business-eur";
export const LEGACY_ENTERPRISE_EUR_PACKAGE_ALIAS = "legacy-enterprise-eur";

// Free plan
export const FREE_PACKAGE_ALIAS = "free-plan";

export type MetronomePackageTier = "free" | "pro" | "business" | "enterprise";

export const PAYG_ELIGIBLE_TIERS: readonly MetronomePackageTier[] = [
  "enterprise",
  "business",
];

export function isPaygEligibleTier(tier: MetronomePackageTier): boolean {
  return PAYG_ELIGIBLE_TIERS.includes(tier);
}

export type BillingFrequency = "MONTHLY" | "ANNUAL";

/**
 * Classify a Metronome package by its display name. The match is a
 * case-insensitive whole-word search ordered by specificity:
 * "enterprise" → enterprise, "business" → business, "pro" → pro,
 * "free" → free.
 *
 * Names lacking any of those keywords return `null` — callers refuse such
 * packages explicitly. This is a deliberate trade-off vs. a closed-set
 * alias check: sales can add a new package in Metronome (e.g. a future
 * "Pro Plan 2027") without a code change as long as its name contains one
 * of the tier keywords.
 */
export function classifyMetronomePackageByName(
  name: string
): MetronomePackageTier | null {
  const normalized = name.toLowerCase();
  if (/\benterprise\b/.test(normalized)) {
    return "enterprise";
  }
  if (/\bbusiness\b/.test(normalized)) {
    return "business";
  }
  if (/\bpro\b/.test(normalized)) {
    return "pro";
  }
  if (/\bfree\b/.test(normalized)) {
    return "free";
  }
  return null;
}

export function classifyMetronomePackageCurrencyByName(
  name: string
): SupportedCurrency {
  const normalized = name.toLowerCase();
  if (/\b(?:eur|euro)\b/.test(normalized)) {
    return "eur";
  }
  return "usd";
}

export interface MetronomeEvent {
  transaction_id: string;
  customer_id: string;
  event_type: string;
  timestamp: string;
  properties: Record<string, string | number>;
}

export type MetronomeBalance = Commit | Credit;
export type { Commit as MetronomeCommit, Credit as MetronomeCredit };

// Names of the recurring credits provisioned by scripts/metronome_setup.ts.
export const FREE_MONTHLY_CREDIT_NAME = "Free Monthly Credits";
export const FREE_ANNUAL_CREDIT_NAME = "Free Annual Credits";
// The "excess" recurring credit absorbs over-consumption (priority 100,
// granted at the start of each billing period). Defined in
// scripts/metronome_setup.ts -> getFreeExcessRecurringCredits(). Has its own
// FIXED product so it surfaces as a distinct invoice line item.
export const EXCESS_CREDIT_NAME = "Excess Credits";

// Per-period amount granted by the recurring "Excess Credits" credit in
// every package. The amount depends on the credit type: AWU packages use a
// larger buffer than the legacy programmatic USD packages because AWU
// pricing is per unit while programmatic USD is in dollars. Mirrors the
// values passed to getFreeExcessRecurringCredits(...) in
// scripts/metronome_setup.ts. Only AWU recurring excess credits are ever
// toggled at runtime (see lib/metronome/payg_excess_credits.ts).
export const DEFAULT_AWU_EXCESS_RECURRING_AMOUNT = 5_000;
export const DEFAULT_PROGRAMMATIC_USD_EXCESS_RECURRING_AMOUNT = 50;

// Excess credits are an internal accounting mechanism — they should not be
// surfaced to end users or in the Poke UI. Discriminated by product ID since
// the excess recurring credit has its own dedicated FIXED product.
export function isMetronomeExcessCredit(entry: MetronomeBalance): boolean {
  return entry.product.id === getProductExcessCreditsId();
}

// True for the recurring free credits granted to programmatic-usage workspaces
// (monthly or annual cadence). The "excess" credit is excluded — it has its
// own product. Checks product + priority + credit type so callers don't have to.
export function isMetronomeFreeCredit(entry: MetronomeBalance): boolean {
  return (
    entry.product.id === getProductFreeCreditId() &&
    entry.priority === 1 &&
    entry.access_schedule?.credit_type?.id === getCreditTypeProgrammaticUsdId()
  );
}

// Programmatic Usage Credits is a custom Metronome credit type (1 PUC = 1 USD).
// `amount` and `balance` fields on commits/credits of this type are denominated in PUC.
export const METRONOME_PROGRAMMATIC_USAGE_CREDIT_TO_MICRO_USD = 1_000_000;
export const MICRO_USD_PER_DOLLAR = 1_000_000;
// Minimum one-time credit purchase amount ($1)
export const MIN_CREDIT_PURCHASE_AMOUNT_MICRO_USD = MICRO_USD_PER_DOLLAR;
// Hard cap used by purchase UIs
export const MAX_CREDIT_PURCHASE_AMOUNT_MICRO_USD = 1_000_000_000;
export interface MetronomeUsageListResponse {
  billableMetricId: string;
  billableMetricName: string;
  customerId: string;
  startTimestamp: string;
  endTimestamp: string;
  value: number | null;
}

export interface MetronomeUsageWithGroupsResponse {
  startingOn: string;
  endingBefore: string;
  value: number | null;
  group: Record<string, string> | null;
}

export interface MetronomeSeatBalance {
  seat_id: string;
  balances: Array<{
    credit_type_id: string;
    balance: number;
    starting_balance: number;
  }>;
}

export function isMetronomeSeatBalance(v: unknown): v is MetronomeSeatBalance {
  if (typeof v !== "object" || v === null) {
    return false;
  }
  const obj = v as Record<string, unknown>;
  if (typeof obj["seat_id"] !== "string") {
    return false;
  }
  if (!Array.isArray(obj["balances"])) {
    return false;
  }
  return obj["balances"].every(
    (b) =>
      typeof b === "object" &&
      b !== null &&
      typeof (b as Record<string, unknown>)["credit_type_id"] === "string" &&
      typeof (b as Record<string, unknown>)["balance"] === "number" &&
      typeof (b as Record<string, unknown>)["starting_balance"] === "number"
  );
}
