import {
  isProgrammaticUsage,
  trackProgrammaticCost,
} from "@app/lib/api/programmatic_usage/tracking";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { syncMauCount } from "@app/lib/metronome/mau_sync";
import {
  AgentMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { PlanModel, SubscriptionModel } from "@app/lib/models/plan";
import { FREE_TEST_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { getStripeSubscription } from "@app/lib/plans/stripe";
import { reportUsageForSubscriptionItems } from "@app/lib/plans/usage";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import mainLogger from "@app/logger/logger";
import logger from "@app/logger/logger";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { AGENT_MESSAGE_STATUSES_TO_TRACK } from "@app/types/assistant/conversation";
import { isDevelopment } from "@app/types/shared/env";

export async function recordUsageActivity(workspaceId: string) {
  const workspace = await WorkspaceResource.fetchById(workspaceId);

  const logger = mainLogger.child({ workspaceId });
  logger.info({}, "[UsageQueue] Recording usage for worskpace.");

  if (!workspace) {
    // The workspace likely deleted during the debouncing period of usage reporting.
    logger.info(
      "[UsageQueue] Cannot record usage of subscription: workspace not found."
    );
    return;
  }

  const subscription = await SubscriptionModel.findOne({
    where: {
      workspaceId: workspace.id,
      status: "active",
    },
    include: [PlanModel],
  });

  if (!subscription) {
    // The workspace likely downgraded during the debouncing period of usage reporting.
    logger.info(
      "[UsageQueue] Cannot record usage of subscription: missing subscription."
    );
    return;
  }

  // Legacy free test plans don't have a Stripe subscription.
  if (subscription.plan.code === FREE_TEST_PLAN_CODE) {
    logger.info(
      { subscription },
      "[UsageQueue] Subscription is on free test plan -- skipping reporting usage."
    );

    return;
  }

  if (!subscription.stripeSubscriptionId) {
    // TODO(2024-04-05 flav) Uncomment once all workspaces have a valid stripe subscription.
    // throw new Error(
    //   "Cannot record usage of subscription: missing Stripe subscription Id or Stripe customer Id."
    // );
    logger.info(
      { subscription },
      "[UsageQueue] Cannot record usage of subscription: missing Stripe subscription Id."
    );

    return;
  }

  const stripeSubscription = await getStripeSubscription(
    subscription.stripeSubscriptionId
  );
  if (!stripeSubscription) {
    throw new Error(
      `Cannot update usage in subscription: Stripe subscription ${subscription.stripeSubscriptionId} not found.`
    );
  }

  await reportUsageForSubscriptionItems(
    stripeSubscription,
    renderLightWorkspaceType({ workspace })
  );
}

export async function trackProgrammaticUsageActivity(
  authType: AuthenticatorType,
  { agentLoopArgs }: { agentLoopArgs: AgentLoopArgs }
): Promise<{ tracked: boolean; origin: UserMessageOrigin }> {
  const authResult = await Authenticator.fromJSON(authType);
  if (authResult.isErr()) {
    throw new Error(
      `Failed to deserialize authenticator: ${authResult.error.code}`
    );
  }
  const auth = authResult.value;
  const workspace = auth.getNonNullableWorkspace();

  const { agentMessageId, userMessageId } = agentLoopArgs;

  // Query the Message/AgentMessage rows.
  const agentMessageRow = await MessageModel.findOne({
    where: {
      sId: agentMessageId,
      workspaceId: workspace.id,
    },
    include: [
      {
        model: AgentMessageModel,
        as: "agentMessage",
        required: true,
      },
    ],
  });

  const agentMessage = agentMessageRow?.agentMessage;

  // Query the UserMessage row to get user.
  const userMessageRow = await MessageModel.findOne({
    where: {
      sId: userMessageId,
      workspaceId: workspace.id,
    },
    include: [
      {
        model: UserMessageModel,
        as: "userMessage",
        required: true,
      },
    ],
  });

  const userMessage = userMessageRow?.userMessage;

  if (!agentMessage || !userMessage || !agentMessageRow || !userMessageRow) {
    throw new Error("Agent message or user message not found");
  }

  const userMessageOrigin = userMessage.userContextOrigin;

  // Use dustRunIds from this specific agent loop execution if available,
  // fall back to all accumulated runIds on the message (legacy behavior).
  const effectiveRunIds = agentLoopArgs.dustRunIds ?? agentMessage.runIds;

  if (
    AGENT_MESSAGE_STATUSES_TO_TRACK.includes(agentMessage.status) &&
    effectiveRunIds &&
    effectiveRunIds.length > 0 &&
    isProgrammaticUsage(auth, { userMessageOrigin })
  ) {
    const localLogger = logger.child({
      workspaceId: workspace.sId,
      agentMessageId,
      agentMessageVersion: agentMessageRow.version,
      conversationId: agentMessageRow.conversationId,
      userMessageId,
      userMessageVersion: userMessageRow.version,
      userMessageOrigin,
    });

    localLogger.info("[Programmatic Usage Tracking] Starting activity");

    const result = await trackProgrammaticCost(
      auth,
      {
        dustRunIds: effectiveRunIds,
        userMessageOrigin,
      },
      localLogger
    );

    return { tracked: true, ...(result ?? {}), origin: userMessageOrigin };
  }

  return { tracked: false, origin: userMessageOrigin };
}

/**
 * Sync MAU subscription quantities for all Metronome-enabled workspaces.
 * Called daily by the Metronome gauge schedule.
 */
export async function emitMetronomeGaugeEventsForAllWorkspacesActivity(): Promise<void> {
  // Only workspaces with a metronomeCustomerId.
  const allWorkspaces = await WorkspaceResource.listAll();
  const metronomeWorkspaces = allWorkspaces.filter(
    (w) => w.metronomeCustomerId !== null
  );

  // In production, only sync for workspaces whose billing cycle
  // ends within the next 24h. In dev, sync for all workspaces (hourly schedule).
  let workspaces: WorkspaceResource[];
  if (isDevelopment()) {
    workspaces = metronomeWorkspaces;
  } else {
    // Batch-fetch active subscriptions for all Metronome-enabled workspaces.
    const subscriptionsByWorkspaceId =
      await SubscriptionResource.fetchActiveByWorkspacesModelId(
        metronomeWorkspaces.map((w) => w.id)
      );

    const now = new Date();
    // The cron runs at 2am UTC. We check for cycles ending between 3am today
    // and 3am tomorrow to cover the full day with a 1h buffer after launch.
    const todayAt3am = new Date(now);
    todayAt3am.setUTCHours(3, 0, 0, 0);
    const tomorrowAt3am = new Date(todayAt3am.getTime() + 24 * 60 * 60 * 1000);
    const results = await concurrentExecutor(
      metronomeWorkspaces,
      async (workspace): Promise<WorkspaceResource | null> => {
        const subscription = subscriptionsByWorkspaceId[workspace.id];
        if (!subscription?.stripeSubscriptionId) {
          return null;
        }
        const stripeSubscription = await getStripeSubscription(
          subscription.stripeSubscriptionId
        );
        if (!stripeSubscription) {
          return null;
        }
        const periodEnd = new Date(
          stripeSubscription.current_period_end * 1000
        );
        return periodEnd >= todayAt3am && periodEnd <= tomorrowAt3am
          ? workspace
          : null;
      },
      { concurrency: 10 }
    );
    workspaces = results.filter((w): w is WorkspaceResource => w !== null);
  }

  // Batch-fetch subscriptions for the filtered workspaces to get contract IDs.
  const subscriptionsByWorkspaceId =
    await SubscriptionResource.fetchActiveByWorkspacesModelId(
      workspaces.map((w) => w.id)
    );

  logger.info(
    {
      totalMetronomeWorkspaces: metronomeWorkspaces.length,
      workspaceCount: workspaces.length,
    },
    "[Metronome] Syncing MAU counts for workspaces with billing cycle ending today"
  );

  await concurrentExecutor(
    workspaces,
    async (workspace) => {
      const subscription = subscriptionsByWorkspaceId[workspace.id];
      if (
        !workspace.metronomeCustomerId ||
        !subscription?.metronomeContractId
      ) {
        return;
      }

      try {
        await syncMauCount({
          metronomeCustomerId: workspace.metronomeCustomerId,
          contractId: subscription.metronomeContractId,
          workspace: renderLightWorkspaceType({ workspace }),
        });
      } catch (err) {
        logger.error(
          { workspaceId: workspace.sId, error: err },
          "[Metronome] Failed to sync MAU count for workspace"
        );
      }
    },
    { concurrency: 10 }
  );
}
