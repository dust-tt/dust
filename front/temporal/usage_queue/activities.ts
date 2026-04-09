import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
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
  buildWorkspaceGaugeEvent,
} from "@app/lib/metronome/events";
import type { MetronomeEvent } from "@app/lib/metronome/types";
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
import { KeyResource } from "@app/lib/resources/key_resource";
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
import { isDevelopment } from "@app/types/shared/env";
import { createHash } from "crypto";

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
  const { agentMessageId, conversationId, userMessageId } = agentLoopArgs;
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
  if (!agentMessage) {
    return;
  }

  // Use dustRunIds from this specific agent loop execution if available,
  // fall back to all accumulated runIds on the message (legacy behavior).
  const effectiveRunIds = agentLoopArgs.dustRunIds ?? agentMessage.runIds;
  if (!effectiveRunIds || effectiveRunIds.length === 0) {
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
  // Use updatedAt — this is when the agent message finished (not when it was created).
  const timestamp = agentMessage.updatedAt.toISOString();
  const authMethod = userMessage?.userContextAuthMethod ?? null;
  const agentId = agentMessage.agentConfigurationId ?? null;
  const messageStatus = agentMessage.status ?? "unknown";

  // Resolve API key name from the stored numeric FK.
  let apiKeyName: string | null = null;
  if (userMessage?.userContextApiKeyId) {
    const key = await KeyResource.fetchByWorkspaceAndId({
      workspace,
      id: userMessage.userContextApiKeyId,
    });
    apiKeyName = key?.name ?? null;
  }

  // Get LLM run usages.
  const runs = await RunResource.listByDustRunIds(auth, {
    dustRunIds: effectiveRunIds,
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

  // Get MCP actions — filter to this execution's steps if startStep is available,
  // and only include actions with a final status (succeeded/errored/denied).
  // Actions with blocked/transient status haven't been executed yet and shouldn't be billed.
  const allMcpActions = await AgentMCPActionResource.listByAgentMessageIds(
    auth,
    [agentMessage.id]
  );
  const mcpActions = allMcpActions.filter((a) => {
    const json = a.toJSON();
    if (!isToolExecutionStatusFinal(json.status)) {
      return false;
    }
    if (
      agentLoopArgs.startStep !== undefined &&
      json.step < agentLoopArgs.startStep
    ) {
      return false;
    }
    return true;
  });
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

  // Deterministic runKey based on the specific dustRunIds being processed.
  // Same runIds → same transaction IDs → Metronome deduplicates retries.
  // Different runIds (new agent loop execution) → different transaction IDs.
  const runKey = createHash("sha256")
    .update(effectiveRunIds.sort().join(","))
    .digest("hex")
    .slice(0, 8);

  // Build and ingest events.
  const llmEvents = buildLlmUsageEvents({
    workspaceId: workspace.sId,
    conversationId,
    userId,
    agentMessageId,
    agentId,
    parentAgentMessageId,
    runKey,
    runUsages,
    origin: userMessageOrigin,
    isProgrammaticUsage: programmatic,
    authMethod,
    apiKeyName,
    messageStatus,
    isSubAgentMessage,
    timestamp,
  });

  const toolEvents = buildToolUseEvents({
    workspaceId: workspace.sId,
    conversationId,
    userId,
    agentMessageId,
    agentId,
    parentAgentMessageId,
    runKey,
    actions: toolActions,
    origin: userMessageOrigin,
    isProgrammaticUsage: programmatic,
    authMethod,
    apiKeyName,
    messageStatus,
    isSubAgentMessage,
    timestamp,
  });

  await ingestMetronomeEvents([...llmEvents, ...toolEvents]);
}

/**
 * Emit a single workspace_gauge event for each Metronome-enabled workspace.
 * Collects all events first, then ingests in batches.
 * Called daily by the Metronome gauge schedule.
 */
export async function emitMetronomeGaugeEventsForAllWorkspacesActivity(): Promise<void> {
  // Only workspaces with a metronomeCustomerId.
  const allWorkspaces = await WorkspaceResource.listAll();
  const workspaces = allWorkspaces.filter(
    (w) => w.metronomeCustomerId !== null
  );

  const now = new Date();
  // In dev (hourly schedule), include the hour so re-runs aren't deduplicated.
  // In prod (daily), use YYYY-MM-DD only.
  const dateKey = isDevelopment()
    ? now.toISOString().slice(0, 13) // YYYY-MM-DDTHH
    : now.toISOString().slice(0, 10); // YYYY-MM-DD
  const timestamp = now.toISOString();

  logger.info(
    { workspaceCount: workspaces.length, dateKey },
    "[Metronome] Emitting gauge events for Metronome-enabled workspaces"
  );

  // Process workspaces in chunks: build events concurrently, then ingest
  // each chunk before moving to the next. Avoids holding all events in memory.
  const CHUNK_SIZE = 100;
  for (let i = 0; i < workspaces.length; i += CHUNK_SIZE) {
    const chunk = workspaces.slice(i, i + CHUNK_SIZE);
    const events: MetronomeEvent[] = [];

    await concurrentExecutor(
      chunk,
      async (workspace) => {
        try {
          const event = await buildGaugeEventForWorkspace(
            workspace,
            timestamp,
            dateKey
          );
          events.push(event);
        } catch (err) {
          logger.error(
            { workspaceId: workspace.sId, error: err },
            "[Metronome] Failed to build gauge event for workspace"
          );
        }
      },
      { concurrency: 10 }
    );

    await ingestMetronomeEvents(events);
  }
}

async function buildGaugeEventForWorkspace(
  workspace: WorkspaceResource,
  timestamp: string,
  dateKey: string
): Promise<MetronomeEvent> {
  const lightWorkspace = renderLightWorkspaceType({ workspace });

  // Active member count.
  const memberCount = await MembershipResource.countActiveMembersForWorkspace({
    workspace: lightWorkspace,
  });

  // MAU counts — rolling 30-day window with different message thresholds.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [mau1Count, mau5Count, mau10Count] = await Promise.all([
    countActiveUsersForPeriodInWorkspace({
      messagesPerMonthForMau: 1,
      since: thirtyDaysAgo,
      workspace: lightWorkspace,
    }),
    countActiveUsersForPeriodInWorkspace({
      messagesPerMonthForMau: 5,
      since: thirtyDaysAgo,
      workspace: lightWorkspace,
    }),
    countActiveUsersForPeriodInWorkspace({
      messagesPerMonthForMau: 10,
      since: thirtyDaysAgo,
      workspace: lightWorkspace,
    }),
  ]);

  return buildWorkspaceGaugeEvent({
    workspaceId: workspace.sId,
    memberCount,
    mau1Count,
    mau5Count,
    mau10Count,
    timestamp,
    dateKey,
  });
}
