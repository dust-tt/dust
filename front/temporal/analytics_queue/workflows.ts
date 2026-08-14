import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/analytics_queue/activities";
import { storeAgentMessageConsumptionAttributionV3Signal } from "@app/temporal/analytics_queue/signals";
import type {
  AgentLoopArgs,
  AgentMessageRef,
} from "@app/types/assistant/agent_run";
import { defineQuery, proxyActivities, setHandler } from "@temporalio/workflow";

// Queried by the launcher to recover a running export's parameters instead of relying on the
// workflow memo, which is persisted to the visibility store and size-limited: a filter can carry
// arbitrarily many scope ids (agents, users, tools, ...) and would risk exceeding that limit.
export const getConsumptionExportParamsQuery = defineQuery<{
  period: ConsumptionPeriod;
  filter: ConsumptionScopeFilter;
}>("get_consumption_export_params");

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
  startToCloseTimeout: "5 minutes",
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
    exportId,
  }: {
    period: ConsumptionPeriod;
    filter: ConsumptionScopeFilter;
    exportId: string;
  }
): Promise<void> {
  setHandler(getConsumptionExportParamsQuery, () => ({ period, filter }));

  // exportId is computed by the launcher (see buildConsumptionExportCacheKey) rather than
  // here, so it stays fixed across activity retries within this run just like the old
  // runId-based scheme, but can also be reused across separate runs for closed periods.
  await runConsumptionExportActivity(authType, {
    period,
    filter,
    exportId,
  });
}
