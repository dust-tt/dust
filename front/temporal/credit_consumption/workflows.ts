import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/credit_consumption/activities";
import type { FinalizedConsumptionExecution } from "@app/temporal/credit_consumption/activities";
import { consumptionEventsAppendedSignal } from "@app/temporal/credit_consumption/signals";
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

export type CreditConsumptionWorkflowArgs = {
  runKey: string;
  resumeState?: {
    finalizedExecution: FinalizedConsumptionExecution | null;
    billed: boolean;
    esPending: boolean;
  };
};

export async function creditConsumptionWorkflow(
  authType: AuthenticatorType,
  { runKey, resumeState }: CreditConsumptionWorkflowArgs
): Promise<void> {
  let pendingEvents = true;
  let finalizedExecution = resumeState?.finalizedExecution ?? null;

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
        eventModelIds: result.eventModelIds,
      });
      hasMore = result.hasMore;
      finalizedExecution ??= result.finalizedExecution;

      batchCount += 1;
      if (batchCount >= MAX_BATCHES_BEFORE_CONTINUE_AS_NEW) {
        await continueAsNew<typeof creditConsumptionWorkflow>(authType, {
          runKey,
          resumeState: {
            finalizedExecution,
            billed: resumeState?.billed ?? false,
            esPending: result.esPending,
          },
        });
      }
    }

    if (finalizedExecution) {
      return;
    }
    const signalled = await condition(() => pendingEvents, IDLE_TIMEOUT_MS);
    if (!signalled) {
      return;
    }
  }
}
