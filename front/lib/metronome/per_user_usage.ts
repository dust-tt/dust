import {
  ceilToHourISO,
  floorToHourISO,
  listMetronomeDraftInvoices,
  listMetronomeUsageWithGroups,
} from "@app/lib/metronome/client";
import { getMetricLlmProviderCostAwuId } from "@app/lib/metronome/constants";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export async function fetchPerUserAwuUsage({
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

  const startingOn = floorToHourISO(new Date(currentInvoice.start_timestamp));
  const endingBefore = ceilToHourISO(new Date(currentInvoice.end_timestamp));

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
