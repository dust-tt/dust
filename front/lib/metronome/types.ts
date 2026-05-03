/**
 * Core types for the Metronome billing integration.
 *
 * SDK types (Metronome.V1.*) are used directly for API responses.
 * MetronomeEvent is our own type — stricter than the SDK's UsageIngestParams
 * because we enforce `properties: Record<string, string | number>` (no unknown).
 */
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

export interface MetronomeEvent {
  transaction_id: string;
  customer_id: string;
  event_type: string;
  timestamp: string;
  properties: Record<string, string | number>;
}

export type MetronomeBalance = Commit | Credit;
export type { Commit as MetronomeCommit, Credit as MetronomeCredit };

// Programmatic Usage Credits is a custom Metronome credit type (1 PUC = 1 USD).
// `amount` and `balance` fields on commits/credits of this type are denominated in PUC.
export const METRONOME_PROGRAMMATIC_USAGE_CREDIT_TO_MICRO_USD = 1_000_000;

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
