import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/analytics_queue/activities";
import { storeAgentMessageConsumptionAttributionV3Signal } from "@app/temporal/analytics_queue/signals";
import type {
  AgentLoopArgs,
  AgentMessageRef,
} from "@app/types/assistant/agent_run";
import {
  proxyActivities,
  setHandler,
  workflowInfo,
} from "@temporalio/workflow";

const { storeAgentAnalyticsActivity, storeAgentMessageFeedbackActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "5 minutes",
    retry: {
      // Analytics is best effort, only retry twice.
      maximumAttempts: 2,
      initialInterval: "30 seconds",
      backoffCoefficient: 2,
    },
  });

// Consumption indexing is idempotent. The default policy retries without an attempt limit.
const {
  storeAgentMessageConsumptionAnalyticsActivity,
  storeAgentMessageConsumptionAttributionForMessageActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

// scheduleToCloseTimeout bounds the total time across all retries: a persistent
// Elasticsearch/GCS failure must eventually fail the workflow rather than retry
// forever, since the workflow ID is stable per workspace and blocks subsequent
// export requests while running. 3 attempts at up to 30 minutes each, plus
// backoff, comfortably fits inside the 3-hour ceiling.
const { runConsumptionExportActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
  scheduleToCloseTimeout: "3 hours",
  retry: {
    maximumAttempts: 3,
    initialInterval: "2 minutes",
    backoffCoefficient: 2,
  },
});

const { cleanupConsumptionExportsActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "10 minutes",
});

export async function storeAgentAnalyticsWorkflow(
  authType: AuthenticatorType,
  {
    agentLoopArgs,
  }: {
    agentLoopArgs: AgentLoopArgs;
  }
): Promise<void> {
  await storeAgentAnalyticsActivity(authType, {
    agentLoopArgs,
  });
}

export async function storeAgentMessageFeedbackWorkflow(
  authType: AuthenticatorType,
  {
    message,
  }: {
    message: AgentMessageRef;
  }
): Promise<void> {
  await storeAgentMessageFeedbackActivity(authType, {
    message,
  });
}

// Recomputes attribution and indexes consumption analytics after each committed pass.
export async function storeAgentMessageConsumptionAttributionV3Workflow(
  authType: AuthenticatorType,
  { message }: { message: AgentMessageRef }
): Promise<void> {
  let pendingRecompute = true;

  setHandler(storeAgentMessageConsumptionAttributionV3Signal, () => {
    pendingRecompute = true;
  });

  while (pendingRecompute) {
    pendingRecompute = false;

    await storeAgentMessageConsumptionAttributionForMessageActivity(authType, {
      message,
    });

    await storeAgentMessageConsumptionAnalyticsActivity(authType, {
      message,
    });
  }
}

export async function runConsumptionExportWorkflow(
  authType: AuthenticatorType,
  {
    period,
    filter,
  }: {
    period: ConsumptionPeriod;
    filter: ConsumptionScopeFilter;
  }
): Promise<void> {
  // runId (not workflowId) so each trigger produces its own GCS object: the
  // workflow ID is stable per workspace to enforce a single in-flight export,
  // but runId is unique per execution while still stable across activity
  // retries within that execution (unlike Date.now() computed inside the
  // activity), so a retry after a lost completion ack re-uploads to the same
  // GCS path instead of leaving an orphaned duplicate zip.
  const { runId } = workflowInfo();

  await runConsumptionExportActivity(authType, {
    period,
    filter,
    exportId: runId,
  });
}

export async function cleanupConsumptionExportsWorkflow(): Promise<void> {
  await cleanupConsumptionExportsActivity();
}
