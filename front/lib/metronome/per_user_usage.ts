import {
  ceilToMidnightUTC,
  floorToMidnightUTC,
  listMetronomeDraftInvoices,
  listMetronomeUsageWithGroups,
} from "@app/lib/metronome/client";
import { getMetricLlmProviderCostAwuId } from "@app/lib/metronome/constants";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Fetch per-user pool consumption for the current billing period.
 *
 * Returns a `Map<userSId, awuCreditsConsumed>` covering only events tagged
 * `usage_type === "user"` (i.e. workspace pool consumption — not
 * programmatic). Period is derived from the customer's current draft
 * invoice for the given contract.
 *
 * Empty map (Ok) when there is no current draft invoice — the user
 * legitimately has no period yet. Err only when a Metronome call fails.
 */
export async function fetchPerUserPoolUsage({
  metronomeCustomerId,
  metronomeContractId,
}: {
  metronomeCustomerId: string;
  metronomeContractId: string;
}): Promise<Result<Map<string, number>, Error>> {
  const invoicesResult = await listMetronomeDraftInvoices(metronomeCustomerId);
  if (invoicesResult.isErr()) {
    return new Err(invoicesResult.error);
  }

  const now = Date.now();
  const currentInvoice = invoicesResult.value.find((inv) => {
    if (inv.contract_id !== metronomeContractId) {
      return false;
    }
    if (!inv.start_timestamp || !inv.end_timestamp) {
      return false;
    }
    const startMs = new Date(inv.start_timestamp).getTime();
    const endMs = new Date(inv.end_timestamp).getTime();
    return startMs <= now && now < endMs;
  });

  if (!currentInvoice?.start_timestamp || !currentInvoice.end_timestamp) {
    return new Ok(new Map());
  }

  const startingOn = floorToMidnightUTC(
    new Date(currentInvoice.start_timestamp)
  ).toISOString();
  const endingBefore = ceilToMidnightUTC(
    new Date(currentInvoice.end_timestamp)
  ).toISOString();

  const usageResult = await listMetronomeUsageWithGroups({
    customerId: metronomeCustomerId,
    billableMetricId: getMetricLlmProviderCostAwuId(),
    startingOn,
    endingBefore,
    windowSize: "NONE",
    groupKey: ["user_id", "usage_type"],
  });

  if (usageResult.isErr()) {
    return new Err(usageResult.error);
  }

  const perUser = new Map<string, number>();
  for (const entry of usageResult.value) {
    const userId = entry.group?.["user_id"];
    const usageType = entry.group?.["usage_type"];
    if (!userId || usageType !== "user" || entry.value === null) {
      continue;
    }
    const existing = perUser.get(userId) ?? 0;
    perUser.set(userId, existing + entry.value);
  }
  return new Ok(perUser);
}
