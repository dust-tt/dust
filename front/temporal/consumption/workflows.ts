import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/consumption/activities";
import { consumptionEventsAppendedSignal } from "@app/temporal/consumption/signals";
import {
  condition,
  continueAsNew,
  proxyActivities,
  setHandler,
} from "@temporalio/workflow";

const {
  applyConsumptionEventsActivity,
  markConsumptionEventsProcessedActivity,
} = proxyActivities<typeof activities>({ startToCloseTimeout: "2 minutes" });

const MAX_BATCHES_BEFORE_CONTINUE_AS_NEW = 200;
const IDLE_TIMEOUT_MS = 6 * 60 * 60 * 1_000;

export async function consumptionWorkflow(
  authType: AuthenticatorType,
  { runKey }: { runKey: string }
): Promise<void> {
  let pendingEvents = true;
  let finalized = false;

  setHandler(consumptionEventsAppendedSignal, () => {
    pendingEvents = true;
  });

  let batchCount = 0;
  for (;;) {
    pendingEvents = false;

    let hasMore = true;
    while (hasMore) {
      const result = await applyConsumptionEventsActivity(authType, { runKey });
      await markConsumptionEventsProcessedActivity(authType, {
        runKey,
        eventIds: result.eventIds,
      });
      hasMore = result.hasMore;
      finalized ||= result.finalizedStatus !== null;

      batchCount += 1;
      if (batchCount >= MAX_BATCHES_BEFORE_CONTINUE_AS_NEW) {
        await continueAsNew<typeof consumptionWorkflow>(authType, { runKey });
      }
    }

    if (finalized) {
      return;
    }
    const signalled = await condition(() => pendingEvents, IDLE_TIMEOUT_MS);
    if (!signalled) {
      return;
    }
  }
}
