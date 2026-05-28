import { listMetronomeDraftInvoices } from "@app/lib/metronome/client";
import { getProductAiUsageId } from "@app/lib/metronome/constants";
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

  if (!currentInvoice?.line_items) {
    return new Ok(new Map());
  }

  const aiUsageProductId = getProductAiUsageId();
  const perUser = new Map<string, number>();

  for (const lineItem of currentInvoice.line_items) {
    if (lineItem.type !== "usage" || lineItem.product_id !== aiUsageProductId) {
      continue;
    }
    const userId = lineItem.presentation_group_values?.["user_id"];
    if (!userId) {
      continue;
    }
    perUser.set(userId, (perUser.get(userId) ?? 0) + (lineItem.quantity ?? 0));
  }

  return new Ok(perUser);
}
