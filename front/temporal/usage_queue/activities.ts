import config from "@app/lib/api/config";
import {
  isProgrammaticUsage,
  trackProgrammaticCost,
} from "@app/lib/api/programmatic_usage/tracking";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import type { MetronomeEvent } from "@app/lib/metronome/client";
import { ingestMetronomeEvents } from "@app/lib/metronome/client";
import {
  buildLlmUsageEvents,
  buildMauGaugeEvent,
  buildSeatsGaugeEvent,
  buildToolUseEvents,
  classifyMessageTier,
  getToolCategory,
} from "@app/lib/metronome/events";
import {
  AgentMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { PlanModel, SubscriptionModel } from "@app/lib/models/plan";
import { FREE_TEST_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { getStripeSubscription } from "@app/lib/plans/stripe";
import { reportUsageForSubscriptionItems } from "@app/lib/plans/usage";
import { countActiveUsersForPeriodInWorkspace } from "@app/lib/plans/usage/mau";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import mainLogger from "@app/logger/logger";
import logger from "@app/logger/logger";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { AGENT_MESSAGE_STATUSES_TO_TRACK } from "@app/types/assistant/conversation";
import { normalizeError } from "@app/types/shared/utils/error_utils";

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

  // Emit Metronome gauge events for seats and MAU.
  await emitMetronomeGaugeEvents({
    workspace,
    periodStartSeconds: stripeSubscription.current_period_start,
    periodEndSeconds: stripeSubscription.current_period_end,
    logger,
  });
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
        include: [{ model: UserModel, required: false }],
      },
    ],
  });

  const userMessage = userMessageRow?.userMessage;

  if (!agentMessage || !userMessage || !agentMessageRow || !userMessageRow) {
    throw new Error("Agent message or user message not found");
  }

  const userMessageOrigin = userMessage.userContextOrigin;
  const programmaticUsage = isProgrammaticUsage(auth, {
    userMessageOrigin,
  });
  // Emit Metronome events for all usage (programmatic and user).
  if (
    AGENT_MESSAGE_STATUSES_TO_TRACK.includes(agentMessage.status) &&
    agentMessage.runIds
  ) {
    await emitMetronomeUsageEvents(auth, {
      userId: userMessage.user?.sId ?? null,
      agentMessageSId: agentMessageId,
      agentMessageModelId: agentMessage.id,
      dustRunIds: agentMessage.runIds,
      userMessageOrigin,
      isProgrammaticUsage: programmaticUsage,
      isSubAgentMessage: userMessage.agenticMessageType !== null,
    });
  }

  // Track programmatic credit consumption (existing behavior, unchanged).
  if (
    AGENT_MESSAGE_STATUSES_TO_TRACK.includes(agentMessage.status) &&
    agentMessage.runIds &&
    programmaticUsage
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
        dustRunIds: agentMessage.runIds,
        userMessageOrigin,
      },
      localLogger
    );

    return { tracked: true, ...(result ?? {}), origin: userMessageOrigin };
  }

  return { tracked: false, origin: userMessageOrigin };
}

async function emitMetronomeUsageEvents(
  auth: Authenticator,
  {
    userId,
    agentMessageSId,
    agentMessageModelId,
    dustRunIds,
    userMessageOrigin,
    isProgrammaticUsage,
    isSubAgentMessage,
  }: {
    userId: string | null;
    agentMessageSId: string;
    agentMessageModelId: number;
    dustRunIds: string[];
    userMessageOrigin: UserMessageOrigin;
    isProgrammaticUsage: boolean;
    isSubAgentMessage: boolean;
  }
): Promise<void> {
  if (!config.isMetronomeEnabled()) {
    return;
  }

  const workspace = auth.getNonNullableWorkspace();
  const timestamp = new Date().toISOString();

  try {
    // Fetch run usages for LLM token events.
    const runs = await RunResource.listByDustRunIds(auth, { dustRunIds });
    const runUsages = await concurrentExecutor(
      runs,
      (run) => run.listRunUsages(auth),
      { concurrency: 10 }
    );

    // Fetch MCP actions for tool use events.
    const actions = await AgentMCPActionResource.listByAgentMessageIds(auth, [
      agentMessageModelId,
    ]);

    // Classify message tier based on models and tools used (AWU).
    const flatUsages = runUsages.flat();
    const toolCategories = actions.map((a) =>
      getToolCategory(a.toJSON().internalMCPServerName)
    );
    const messageTier = classifyMessageTier({
      modelIds: flatUsages.map((u) => u.modelId),
      toolCategories,
    });

    const llmEvents = buildLlmUsageEvents({
      workspaceSId: workspace.sId,
      userId,
      agentMessageSId,
      runUsages: flatUsages,
      origin: userMessageOrigin,
      isProgrammaticUsage,
      messageTier,
      isSubAgentMessage,
      timestamp,
    });

    const toolEvents = buildToolUseEvents({
      workspaceSId: workspace.sId,
      userId,
      agentMessageSId,
      actions,
      origin: userMessageOrigin,
      isProgrammaticUsage,
      messageTier,
      isSubAgentMessage,
      timestamp,
    });

    await ingestMetronomeEvents([...llmEvents, ...toolEvents]);
  } catch (err) {
    logger.warn(
      { workspaceId: workspace.sId, error: normalizeError(err) },
      "[Metronome] Failed to emit usage events"
    );
  }
}

/**
 * Emit Metronome gauge events (seats + MAU) for all active workspaces.
 * Runs on a schedule (daily in prod, every 10 min in dev).
 */
export async function emitMetronomeGaugeEventsForAllWorkspacesActivity(): Promise<void> {
  if (!config.isMetronomeEnabled()) {
    return;
  }

  const workspaces = await WorkspaceResource.listAll();

  await concurrentExecutor(
    workspaces,
    async (workspace) => {
      try {
        await emitMetronomeGaugeEventsForWorkspace(workspace);
      } catch (err) {
        mainLogger.warn(
          { workspaceId: workspace.sId, error: normalizeError(err) },
          "[Metronome] Failed to emit gauge events for workspace"
        );
      }
    },
    { concurrency: 8 }
  );
}

async function emitMetronomeGaugeEventsForWorkspace(
  workspace: WorkspaceResource
): Promise<void> {
  const lightWorkspace = renderLightWorkspaceType({ workspace });
  const timestamp = new Date().toISOString();
  const events: MetronomeEvent[] = [];

  // Seats gauge.
  const activeSeats = await MembershipResource.countActiveSeatsInWorkspace(
    workspace.sId
  );
  events.push(
    buildSeatsGaugeEvent({
      workspaceSId: workspace.sId,
      seatCount: activeSeats,
      timestamp,
    })
  );

  // MAU gauge — rolling 30-day window.
  const now = new Date();
  const thirtyDaysAgoMs = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const mauCount = await countActiveUsersForPeriodInWorkspace({
    messagesPerMonthForMau: 1,
    since: new Date(thirtyDaysAgoMs),
    to: now,
    workspace: lightWorkspace,
  });
  events.push(
    buildMauGaugeEvent({
      workspaceSId: workspace.sId,
      mauCount,
      timestamp,
    })
  );

  await ingestMetronomeEvents(events);
}

async function emitMetronomeGaugeEvents({
  workspace,
  periodStartSeconds,
  periodEndSeconds,
  logger: parentLogger,
}: {
  workspace: WorkspaceResource;
  periodStartSeconds: number;
  periodEndSeconds: number;
  logger: typeof mainLogger;
}): Promise<void> {
  if (!config.isMetronomeEnabled()) {
    return;
  }

  try {
    await emitMetronomeGaugeEventsForWorkspace(workspace);
  } catch (err) {
    parentLogger.warn(
      { workspaceId: workspace.sId, error: normalizeError(err) },
      "[Metronome] Failed to emit gauge events"
    );
  }
}
