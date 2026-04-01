import {
  isProgrammaticUsage,
  trackProgrammaticCost,
} from "@app/lib/api/programmatic_usage/tracking";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { ingestMetronomeEvents } from "@app/lib/metronome/client";
import {
  buildLlmUsageEvents,
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
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
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

  if (
    AGENT_MESSAGE_STATUSES_TO_TRACK.includes(agentMessage.status) &&
    agentMessage.runIds &&
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
        dustRunIds: agentMessage.runIds,
        userMessageOrigin,
      },
      localLogger
    );

    return { tracked: true, ...(result ?? {}), origin: userMessageOrigin };
  }

  return { tracked: false, origin: userMessageOrigin };
}

/**
 * Emit Metronome llm_usage and tool_use events for an agent message.
 * Called for ALL messages (not just programmatic) — always-on, fire-and-forget.
 * Metronome failures don't affect the agent loop.
 */
export async function emitMetronomeUsageEventsActivity(
  authType: AuthenticatorType,
  { agentLoopArgs }: { agentLoopArgs: AgentLoopArgs }
): Promise<void> {
  const authResult = await Authenticator.fromJSON(authType);
  if (authResult.isErr()) {
    logger.warn(
      { error: authResult.error.code },
      "[Metronome] Failed to deserialize authenticator for usage events"
    );
    return;
  }
  const auth = authResult.value;
  const workspace = auth.getNonNullableWorkspace();
  const { agentMessageId, userMessageId } = agentLoopArgs;
  const userMessageOrigin = agentLoopArgs.userMessageOrigin ?? "web";

  // Query agent message with its run IDs.
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
  if (!agentMessage || !agentMessage.runIds) {
    return;
  }

  // Get user ID for the event.
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

  const userId = userMessageRow?.userMessage?.user?.sId ?? null;

  // Sub-agent messages have agenticMessageType set (e.g. "run_agent", "agent_handover").
  // agenticOriginMessageId is the sId of the parent agent message that spawned this one.
  const userMessage = userMessageRow?.userMessage;
  const parentAgentMessageId = userMessage?.agenticOriginMessageId ?? null;
  const isSubAgentMessage = userMessage?.agenticMessageType !== null;

  const programmatic = isProgrammaticUsage(auth, { userMessageOrigin });
  const timestamp = agentMessageRow.createdAt.toISOString();

  // Get LLM run usages.
  const runs = await RunResource.listByDustRunIds(auth, {
    dustRunIds: agentMessage.runIds,
  });
  const runUsages = (
    await concurrentExecutor(
      runs,
      (run) => {
        return run.listRunUsages(auth);
      },
      { concurrency: 10 }
    )
  ).flat();

  // Get MCP actions.
  const mcpActions = await AgentMCPActionResource.listByAgentMessageIds(auth, [
    agentMessage.id,
  ]);
  const toolActions = mcpActions.map((a) => {
    const json = a.toJSON();
    return {
      toolName: json.toolName,
      mcpServerId: json.mcpServerId,
      internalMCPServerName: json.internalMCPServerName,
      status: json.status,
      executionDurationMs: json.executionDurationMs,
    };
  });

  // Classify message tier.
  const modelIds = runUsages.map((u) => u.modelId);
  const toolCategories = toolActions.map((a) =>
    getToolCategory(a.internalMCPServerName)
  );
  const messageTier = classifyMessageTier({ modelIds, toolCategories });

  // Build and ingest events.
  const llmEvents = buildLlmUsageEvents({
    workspaceId: workspace.sId,
    userId,
    agentMessageId,
    parentAgentMessageId,
    runUsages,
    origin: userMessageOrigin,
    isProgrammaticUsage: programmatic,
    messageTier,
    isSubAgentMessage,
    timestamp,
  });

  const toolEvents = buildToolUseEvents({
    workspaceId: workspace.sId,
    userId,
    agentMessageId,
    parentAgentMessageId,
    actions: toolActions,
    origin: userMessageOrigin,
    isProgrammaticUsage: programmatic,
    messageTier,
    isSubAgentMessage,
    timestamp,
  });

  await ingestMetronomeEvents([...llmEvents, ...toolEvents]);
}
