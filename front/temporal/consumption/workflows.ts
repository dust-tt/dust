import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/consumption/activities";
import { consumptionEventsAppendedSignal } from "@app/temporal/consumption/signals";
import type { EnabledAgentMessageConsumptionMode } from "@app/types/assistant/agent_message_consumption";
import type { AgentMessageStatus } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import {
  condition,
  continueAsNew,
  proxyActivities,
  setHandler,
  sleep,
} from "@temporalio/workflow";

const {
  applyConsumptionEventsActivity,
  billExecutionActivity,
  markConsumptionEventsProcessedActivity,
} = proxyActivities<typeof activities>({ startToCloseTimeout: "2 minutes" });
const {
  cleanupConsumptionEventsActivity,
  recoverPendingConsumptionWorkflowsActivity,
} = proxyActivities<typeof activities>({ startToCloseTimeout: "10 minutes" });

const MAX_BATCHES_BEFORE_CONTINUE_AS_NEW = 200;
const ELASTICSEARCH_RETRY_DELAY_MS = 60_000;
const IDLE_TIMEOUT_MS = 6 * 60 * 60 * 1_000;
const CLEANUP_CONTINUE_DELAY_MS = 1_000;

export async function consumptionWorkflow(
  authType: AuthenticatorType,
  {
    runKey,
    resumeState,
  }: {
    runKey: string;
    resumeState?: {
      finalizedExecution: {
        agentMessageModelId: ModelId;
        consumptionMode: EnabledAgentMessageConsumptionMode;
        rootAgentMessageId: string;
        status: AgentMessageStatus;
        timestamp: string;
      } | null;
      billed: boolean;
      esPending: boolean;
    };
  }
): Promise<void> {
  let pendingEvents = true;
  let finalizedExecution = resumeState?.finalizedExecution ?? null;
  let billed = resumeState?.billed ?? false;
  let esPending = resumeState?.esPending ?? false;

  setHandler(consumptionEventsAppendedSignal, () => {
    pendingEvents = true;
  });

  let batchCount = 0;
  for (;;) {
    pendingEvents = false;

    let hasMore = true;
    while (hasMore) {
      const result = await applyConsumptionEventsActivity(authType, { runKey });
      esPending = result.esPending;
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
      hasMore = !result.esPending && (result.hasMore || billedThisBatch);

      batchCount += 1;
      if (batchCount >= MAX_BATCHES_BEFORE_CONTINUE_AS_NEW) {
        await continueAsNew<typeof consumptionWorkflow>(authType, {
          runKey,
          resumeState: { finalizedExecution, billed, esPending },
        });
      }
    }

    if (billed) {
      if (esPending) {
        await sleep(ELASTICSEARCH_RETRY_DELAY_MS);
        pendingEvents = true;
        continue;
      }
      return;
    }
    if (esPending) {
      await sleep(ELASTICSEARCH_RETRY_DELAY_MS);
      pendingEvents = true;
      continue;
    }
    const signalled = await condition(() => pendingEvents, IDLE_TIMEOUT_MS);
    if (!signalled) {
      return;
    }
  }
}

export async function cleanupConsumptionEventsWorkflow(
  deletedCount = 0
): Promise<number> {
  const result = await cleanupConsumptionEventsActivity();
  const totalDeletedCount = deletedCount + result.deletedCount;
  if (result.hasMore) {
    await sleep(CLEANUP_CONTINUE_DELAY_MS);
    await continueAsNew<typeof cleanupConsumptionEventsWorkflow>(
      totalDeletedCount
    );
  }
  return totalDeletedCount;
}

export async function recoverPendingConsumptionWorkflowsWorkflow(): Promise<number> {
  const result = await recoverPendingConsumptionWorkflowsActivity();
  return result.signalledCount;
}
