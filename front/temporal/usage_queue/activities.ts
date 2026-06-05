import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import { syncMetronomeSeatCountForWorkspace } from "@app/lib/api/metronome/seat_sync";
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
  getUsageType,
} from "@app/lib/metronome/events";
import {
  hasMauSubscriptionInContract,
  syncMauCount,
} from "@app/lib/metronome/mau_sync";
import { getActiveContract } from "@app/lib/metronome/plan_type";
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
import { KeyResource } from "@app/lib/resources/key_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import mainLogger from "@app/logger/logger";
import logger from "@app/logger/logger";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import { isHiddenHelperSubAgentId } from "@app/types/assistant/assistant";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { AGENT_MESSAGE_STATUSES_TO_TRACK } from "@app/types/assistant/conversation";
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
  const auth = await Authenticator.fromJSON(authType);
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
  const auth = await Authenticator.fromJSON(authType);
  const workspace = auth.getNonNullableWorkspace();
  const isByok = auth.getNonNullablePlan().isByok;
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

  // Only send usage events for statuses we track for billing. This ensures
  // Metronome stays consistent with ES analytics and credit consumption.
  if (!AGENT_MESSAGE_STATUSES_TO_TRACK.includes(agentMessage.status)) {
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

  // Prefer the user associated with the UserMessage row; fall back to the
  // user on the authenticator (covers doNotAssociateUser messages like
  // pod_manager sub-conversations where the DB row has no user but the auth
  // still carries the original session user).
  const userId =
    userMessageRow?.userMessage?.user?.sId ?? auth.user()?.sId ?? null;

  // Sub-agent messages have agenticMessageType set (e.g. "run_agent", "agent_handover").
  // agenticOriginMessageId is the sId of the parent agent message that spawned this one.
  const userMessage = userMessageRow?.userMessage;
  const parentAgentMessageId = userMessage?.agenticOriginMessageId ?? null;
  const isSubAgentMessage = userMessage?.agenticMessageType !== null;

  const programmatic = isProgrammaticUsage(auth, { userMessageOrigin });
  const usageType = getUsageType(programmatic, userMessageOrigin);
  // Use updatedAt — this is when the agent message finished (not when it was created).
  const timestamp = agentMessage.updatedAt.toISOString();
  const authMethod = userMessage?.userContextAuthMethod ?? null;
  const messageStatus = agentMessage.status ?? "unknown";

  // Attribute usage to the parent (triggering) agent only for *hidden helper*
  // sub-agents (e.g. the dust-task / dust-planning runs spawned by "go deep").
  // These run in their own child conversation under the workspace system key and
  // are not meaningful to users on their own, so surfacing them by their own name
  // (e.g. "dust-task") is confusing — we attribute their usage to the user-facing
  // parent agent that spawned them instead. Other sub-agents (real user agents
  // invoked via run_agent / agent_handover) keep their own attribution.
  let agentId = agentMessage.agentConfigurationId ?? null;
  // When we override agentId to the parent, keep the original (child) agent id
  // around as sub_agent_id so it can still be recovered from the event if needed.
  let subAgentId: string | null = null;
  if (
    isSubAgentMessage &&
    parentAgentMessageId &&
    agentId &&
    isHiddenHelperSubAgentId(agentId)
  ) {
    const parentAgentMessageRow = await MessageModel.findOne({
      where: { sId: parentAgentMessageId, workspaceId: workspace.id },
      include: [
        { model: AgentMessageModel, as: "agentMessage", required: true },
      ],
    });
    const parentAgentId =
      parentAgentMessageRow?.agentMessage?.agentConfigurationId ?? null;
    if (parentAgentId) {
      subAgentId = agentId;
      agentId = parentAgentId;
    }
  }

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
  const runUsages = await RunResource.listRunUsagesForRuns(auth, { runs });

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
    isByok,
    conversationId,
    userId,
    agentMessageId,
    agentId,
    subAgentId,
    parentAgentMessageId,
    runKey,
    runUsages,
    origin: userMessageOrigin,
    usageType,
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
    subAgentId,
    parentAgentMessageId,
    runKey,
    actions: toolActions,
    origin: userMessageOrigin,
    usageType,
    authMethod,
    apiKeyName,
    messageStatus,
    isSubAgentMessage,
    timestamp,
  });

  await ingestMetronomeEvents([...llmEvents, ...toolEvents]);
}

/**
 * Daily sync of the MAU count to Metronome for all workspaces.
 */
export async function syncMauCountToMetronomeForAllWorkspacesActivity(): Promise<void> {
  // Only workspaces with a metronomeCustomerId.
  const allWorkspaces = await WorkspaceResource.listAll();
  const workspaces = allWorkspaces.filter(
    (w) => w.metronomeCustomerId !== null
  );

  // Batch-fetch subscriptions for the filtered workspaces to get contract IDs.
  const subscriptionsByWorkspaceId =
    await SubscriptionResource.fetchActiveByWorkspacesModelId(
      workspaces.map((w) => w.id)
    );

  logger.info(
    {
      workspaceCount: workspaces.length,
    },
    "[Metronome] Syncing MAU counts for all workspaces"
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
        const contract = await getActiveContract(workspace.sId);
        if (!contract) {
          return;
        }
        if (!hasMauSubscriptionInContract(contract)) {
          return;
        }

        const result = await syncMauCount({
          metronomeCustomerId: workspace.metronomeCustomerId,
          contractId: subscription.metronomeContractId,
          workspace: renderLightWorkspaceType({ workspace }),
          contract,
        });
        if (result.isErr()) {
          logger.error(
            { workspaceId: workspace.sId, error: result.error },
            "[Metronome] Failed to sync MAU count for workspace"
          );
          return;
        }
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

/**
 * Sync the Metronome seat count for a single workspace after membership changes were debounced.
 */
export async function syncMetronomeSeatCountActivity(
  workspaceId: string
): Promise<void> {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    logger.info(
      {
        workspaceId,
      },
      "[Metronome] Skipping seat count sync: workspace not found"
    );
    return;
  }

  logger.info(
    { workspaceId: workspace.sId },
    "[Metronome] Executing debounced seat count sync"
  );

  const result = await syncMetronomeSeatCountForWorkspace({
    workspace: renderLightWorkspaceType({ workspace }),
  });
  if (result.isErr()) {
    logger.error(
      { workspaceId: workspace.sId, error: result.error },
      "[Metronome] Failed to sync seat count for workspace"
    );
    throw result.error;
  }
}
