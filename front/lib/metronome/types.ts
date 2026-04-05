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

export const PRO_OR_BUSINESS_PACKAGE_ALIASES: ReadonlySet<string> = new Set([
  LEGACY_PRO_MONTHLY_PACKAGE_ALIAS,
  LEGACY_PRO_ANNUAL_PACKAGE_ALIAS,
  LEGACY_BUSINESS_PACKAGE_ALIAS,
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

export const METRONOME_CENTS_TO_MICRO_USD = 10_000;

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
