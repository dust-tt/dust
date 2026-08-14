import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/analytics_queue/activities";
import { storeAgentMessageConsumptionAttributionV3Signal } from "@app/temporal/analytics_queue/signals";
import type {
  AgentLoopArgs,
  AgentMessageRef,
} from "@app/types/assistant/agent_run";
import { proxyActivities, setHandler } from "@temporalio/workflow";

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

// A raw consumption export can page through a large number of Elasticsearch documents, so it
// gets a much longer ceiling than the other analytics activities on this queue.
const { runConsumptionExportActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
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
  await runConsumptionExportActivity(authType, { period, filter });
}
