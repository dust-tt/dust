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
export const LEGACY_PRO_29_PACKAGE_ALIAS = "legacy-pro-29";
export const LEGACY_BUSINESS_39_PACKAGE_ALIAS = "legacy-business-39";
export const SHADOW_PRO_29_PACKAGE_ALIAS = "shadow-pro-29";
export const SHADOW_BUSINESS_39_PACKAGE_ALIAS = "shadow-business-39";

export const PRO_OR_BUSINESS_PACKAGE_ALIASES: ReadonlySet<string> = new Set([
  LEGACY_PRO_29_PACKAGE_ALIAS,
  LEGACY_BUSINESS_39_PACKAGE_ALIAS,
]);

import type { Commit, Credit } from "@metronome/sdk/resources/shared";

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
