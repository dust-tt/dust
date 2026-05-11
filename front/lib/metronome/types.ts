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
import { assertNever } from "@app/types/shared/utils/assert_never";
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

export const PRO_OR_BUSINESS_PACKAGE_ALIASES: ReadonlySet<string> = new Set([
  LEGACY_PRO_MONTHLY_PACKAGE_ALIAS,
  LEGACY_PRO_ANNUAL_PACKAGE_ALIAS,
  LEGACY_BUSINESS_PACKAGE_ALIAS,
  LEGACY_PRO_MONTHLY_EUR_PACKAGE_ALIAS,
  LEGACY_PRO_ANNUAL_EUR_PACKAGE_ALIAS,
  LEGACY_BUSINESS_EUR_PACKAGE_ALIAS,
]);

export type MetronomePackageTier = "pro" | "business" | "enterprise";

/**
 * Closed set of aliases we know how to classify. Adding a new alias forces
 * `classifyKnownAlias` to error at compile time until it's handled.
 */
export type KnownPackageAlias =
  | typeof LEGACY_PRO_MONTHLY_PACKAGE_ALIAS
  | typeof LEGACY_PRO_ANNUAL_PACKAGE_ALIAS
  | typeof LEGACY_BUSINESS_PACKAGE_ALIAS
  | typeof LEGACY_ENTERPRISE_PACKAGE_ALIAS
  | typeof LEGACY_PRO_MONTHLY_EUR_PACKAGE_ALIAS
  | typeof LEGACY_PRO_ANNUAL_EUR_PACKAGE_ALIAS
  | typeof LEGACY_BUSINESS_EUR_PACKAGE_ALIAS
  | typeof LEGACY_ENTERPRISE_EUR_PACKAGE_ALIAS;

const KNOWN_PACKAGE_ALIASES: ReadonlySet<KnownPackageAlias> =
  new Set<KnownPackageAlias>([
    LEGACY_PRO_MONTHLY_PACKAGE_ALIAS,
    LEGACY_PRO_ANNUAL_PACKAGE_ALIAS,
    LEGACY_BUSINESS_PACKAGE_ALIAS,
    LEGACY_ENTERPRISE_PACKAGE_ALIAS,
    LEGACY_PRO_MONTHLY_EUR_PACKAGE_ALIAS,
    LEGACY_PRO_ANNUAL_EUR_PACKAGE_ALIAS,
    LEGACY_BUSINESS_EUR_PACKAGE_ALIAS,
    LEGACY_ENTERPRISE_EUR_PACKAGE_ALIAS,
  ]);

export function isKnownPackageAlias(alias: string): alias is KnownPackageAlias {
  return KNOWN_PACKAGE_ALIASES.has(alias as KnownPackageAlias);
}

function classifyKnownAlias(alias: KnownPackageAlias): MetronomePackageTier {
  switch (alias) {
    case LEGACY_PRO_MONTHLY_PACKAGE_ALIAS:
    case LEGACY_PRO_ANNUAL_PACKAGE_ALIAS:
    case LEGACY_PRO_MONTHLY_EUR_PACKAGE_ALIAS:
    case LEGACY_PRO_ANNUAL_EUR_PACKAGE_ALIAS:
      return "pro";
    case LEGACY_BUSINESS_PACKAGE_ALIAS:
    case LEGACY_BUSINESS_EUR_PACKAGE_ALIAS:
      return "business";
    case LEGACY_ENTERPRISE_PACKAGE_ALIAS:
    case LEGACY_ENTERPRISE_EUR_PACKAGE_ALIAS:
      return "enterprise";
    default:
      return assertNever(alias);
  }
}

/**
 * Classify a Metronome package by its aliases. Returns `null` when the
 * package has no alias we recognize — callers must explicitly handle that
 * case (typically by refusing the request). This is deliberate: silently
 * defaulting unknown packages to "enterprise" would mask both bespoke
 * per-customer packages and aliases we forgot to enumerate.
 */
export function classifyMetronomePackage(
  aliases: readonly string[]
): MetronomePackageTier | null {
  for (const alias of aliases) {
    if (isKnownPackageAlias(alias)) {
      return classifyKnownAlias(alias);
    }
  }
  return null;
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
// User credits are priced at $0.01 per unit.
export const METRONOME_USER_CREDIT_TO_MICRO_USD = 10_000;

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
