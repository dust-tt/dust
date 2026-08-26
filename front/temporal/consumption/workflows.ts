import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/consumption/activities";
import { consumptionEventsAppendedSignal } from "@app/temporal/consumption/signals";
import type { AgentMessageStatus } from "@app/types/assistant/conversation";
import {
  condition,
  continueAsNew,
  proxyActivities,
  setHandler,
} from "@temporalio/workflow";

const {
  applyConsumptionEventsActivity,
  billExecutionActivity,
  markConsumptionEventsProcessedActivity,
} = proxyActivities<typeof activities>({ startToCloseTimeout: "2 minutes" });

const MAX_BATCHES_BEFORE_CONTINUE_AS_NEW = 200;
const IDLE_TIMEOUT_MS = 6 * 60 * 60 * 1_000;

export async function consumptionWorkflow(
  authType: AuthenticatorType,
  {
    runKey,
    resumeState,
  }: {
    runKey: string;
    resumeState?: {
      finalizedExecution: {
        agentMessageModelId: number;
        rootAgentMessageId: string;
        status: AgentMessageStatus;
        timestamp: string;
      } | null;
      billed: boolean;
    };
  }
): Promise<void> {
  let pendingEvents = true;
  let finalizedExecution = resumeState?.finalizedExecution ?? null;
  let billed = resumeState?.billed ?? false;

  setHandler(consumptionEventsAppendedSignal, () => {
    pendingEvents = true;
  });

  let batchCount = 0;
  for (;;) {
    pendingEvents = false;

    let hasMore = true;
    while (hasMore) {
      const result = await applyConsumptionEventsActivity(authType, { runKey });
      finalizedExecution ??= result.finalizedExecution;
      let billedThisBatch = false;
      if (result.finalizedExecution !== null && !billed) {
        await billExecutionActivity(authType, {
          ...result.finalizedExecution,
          runKey,
        });
        billed = true;
        billedThisBatch = true;
      }
      await markConsumptionEventsProcessedActivity(authType, {
        runKey,
        eventIds: result.eventIds,
      });
      hasMore = result.hasMore || billedThisBatch;

      batchCount += 1;
      if (batchCount >= MAX_BATCHES_BEFORE_CONTINUE_AS_NEW) {
        await continueAsNew<typeof consumptionWorkflow>(authType, {
          runKey,
          resumeState: { finalizedExecution, billed },
        });
      }
    }

    if (billed) {
      return;
    }
    const signalled = await condition(() => pendingEvents, IDLE_TIMEOUT_MS);
    if (!signalled) {
      return;
    }
  }
}
