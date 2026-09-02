import { reconcileApiKey } from "@app/lib/api/metronome/reconcile_credit_state";
import { syncMetronomeSeatCountForWorkspace } from "@app/lib/api/metronome/seat_sync";
import {
  isProgrammaticUsage,
  trackProgrammaticCost,
} from "@app/lib/api/programmatic_usage/tracking";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { ingestMetronomeEvents } from "@app/lib/metronome/client";
import {
  buildUsageEvents,
  computeRunKey,
  getUsageType,
} from "@app/lib/metronome/events";
import {
  AgentMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { PlanModel, SubscriptionModel } from "@app/lib/models/plan";
import {
  FREE_TEST_PLAN_CODE,
  isCreditPricedPlanPrefix,
} from "@app/lib/plans/plan_codes";
import { getStripeSubscription } from "@app/lib/plans/stripe";
import { reportUsageForSubscriptionItems } from "@app/lib/plans/usage";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import mainLogger from "@app/logger/logger";
import logger from "@app/logger/logger";
import { launchReconcileApiKeyCreditStateWorkflow } from "@app/temporal/usage_queue/client";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import { isHiddenHelperSubAgentId } from "@app/types/assistant/assistant";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { AGENT_MESSAGE_STATUSES_TO_TRACK } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";

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

  // Credit-priced (Metronome-billed) plans: skip Stripe reporting entirely.
  if (isCreditPricedPlanPrefix(subscription.plan.code)) {
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

// Bounds how many parent-conversation hops we'll walk to find the human who
// ultimately triggered a message with no direct user attribution (e.g. a
// pod_manager sub-conversation spawned by a system-key hidden helper spawned
// by a real user's top-level conversation). Genuine chains are 1-2 hops deep;
// this just guards against a pathological or cyclic one.
const MAX_ORIGINATING_USER_TRACE_HOPS = 5;

/**
 * Walk `agenticOriginMessageId` links back through parent conversations to
 * find the closest ancestor UserMessage that has a real user attached.
 * `agenticOriginMessageId` points to the parent agent message (in the parent
 * conversation) that spawned the current one; from there we walk `parentId`
 * up that conversation's message chain until we reach the user message it
 * replied to, then repeat if that one is itself unattributed.
 */
async function resolveOriginatingUserId(
  workspace: { id: ModelId },
  startUserMessage: UserMessageModel | undefined
): Promise<string | null> {
  let current = startUserMessage;
  for (let hop = 0; hop < MAX_ORIGINATING_USER_TRACE_HOPS; hop++) {
    if (!current?.agenticOriginMessageId) {
      return null;
    }

    let messageRow = await MessageModel.findOne({
      where: {
        sId: current.agenticOriginMessageId,
        workspaceId: workspace.id,
      },
    });
    for (
      let parentHop = 0;
      parentHop < MAX_ORIGINATING_USER_TRACE_HOPS &&
      messageRow &&
      !messageRow.userMessageId;
      parentHop++
    ) {
      messageRow = messageRow.parentId
        ? await MessageModel.findByPk(messageRow.parentId)
        : null;
    }
    if (!messageRow?.userMessageId) {
      return null;
    }

    current =
      (await UserMessageModel.findOne({
        where: { id: messageRow.userMessageId, workspaceId: workspace.id },
        include: [{ model: UserModel, required: false }],
      })) ?? undefined;
    if (current?.user) {
      return current.user.sId;
    }
  }
  return null;
}

/**
 * Emit the aggregated Metronome usage event (LLM + tool cost) for an agent
 * message. Called for ALL messages (not just programmatic) — always-on,
 * fire-and-forget. Metronome failures don't affect the agent loop.
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
  // still carries the original session user); finally, walk back through
  // agenticOriginMessageId to the closest ancestor conversation that does
  // have one (covers a system-key hidden helper — which has no auth user of
  // its own — calling pod_manager on behalf of a real user's conversation).
  const userId =
    userMessageRow?.userMessage?.user?.sId ??
    auth.user()?.sId ??
    (await resolveOriginatingUserId(workspace, userMessageRow?.userMessage));

  // Determine if the user holds a free seat. Free-seat events use a prefixed
  // user_id ("free-<sId>") so Metronome's free-credit specifier only drains
  // against those events, keeping free credit consumption decoupled from the
  // user's regular billable usage.
  let isFreeSeatedUser = false;
  if (userId) {
    const userResource = await UserResource.fetchById(userId);
    if (userResource) {
      const membership =
        await MembershipResource.getActiveMembershipOfUserInWorkspace({
          user: userResource,
          workspace: renderLightWorkspaceType({ workspace }),
        });
      isFreeSeatedUser = membership?.seatType === "free";
    }
  }

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

  // Resolve API key name from the stored numeric FK. We deliberately never surface
  // the workspace system key ("DustSystemKey") as the API key name: sub-agent runs
  // and other internal flows authenticate with the system key, but that is an
  // implementation detail, not a meaningful billing attribution. In those cases we
  // leave the API key name unset (it surfaces as "unknown" in the event).
  let apiKeyName: string | null = null;
  // Retained for the post-ingest per-key cap reconcile below.
  let apiKey: KeyResource | null = null;
  if (userMessage?.userContextApiKeyId) {
    const key = await KeyResource.fetchByWorkspaceAndId({
      workspace,
      id: userMessage.userContextApiKeyId,
    });
    if (key && !key.isSystem) {
      apiKeyName = key.name;
      apiKey = key;
    }
  }

  // Get LLM run usages.
  const runs = await RunResource.listByDustRunIds(auth, {
    dustRunIds: effectiveRunIds,
  });
  const runUsages = await RunResource.listRunUsagesForRuns(auth, { runs });

  // Get every MCP action for the message so the canonical billing plan can
  // apply message-level policies across interrupt/resume executions. The event
  // adapter only emits the actions belonging to this execution.
  const allMcpActions = await AgentMCPActionResource.listByAgentMessageIds(
    auth,
    [agentMessage.id]
  );
  const toolActions = allMcpActions.map((a) => {
    const json = a.toJSON();

    return {
      toolName: json.toolName,
      mcpServerId: json.mcpServerId,
      internalMCPServerName: json.internalMCPServerName,
      status: json.status,
      shouldEmit:
        agentLoopArgs.startStep === undefined ||
        json.step >= agentLoopArgs.startStep,
    };
  });

  // Deterministic runKey based on the specific dustRunIds being processed.
  // Same runIds → same transaction IDs → Metronome deduplicates retries.
  // Different runIds (new agent loop execution) → different transaction IDs.
  // Shared with the credit-cost flow (computeRunKey) so the credit recompute
  // ceils per the exact same execution partition that is billed here.
  const runKey = computeRunKey(effectiveRunIds);

  // Build and ingest the single aggregated usage event (LLM + tool cost).
  const usageEvents = buildUsageEvents({
    workspaceId: workspace.sId,
    isByok,
    conversationId,
    userId,
    isFreeSeatedUser,
    agentMessageId,
    agentId,
    subAgentId,
    parentAgentMessageId,
    runKey,
    runUsages,
    actions: toolActions,
    origin: userMessageOrigin,
    usageType,
    authMethod,
    apiKeyName,
    messageStatus,
    isSubAgentMessage,
    timestamp,
  });

  await ingestMetronomeEvents(usageEvents);

  // Per-key cap enforcement is pull-based: Metronome spend alerts can't
  // attribute spend by `api_key_name` (it's not the products' presentation
  // group key), so we reconcile the key's credit state from live usage instead
  // (the usage API does attribute by `api_key_name`). Launch a debounced
  // reconcile so it runs after Metronome has ingested the usage emitted above
  // and coalesces bursts on the same key. Only for keys that carry a cap; the
  // reconcile activity re-checks plan/contract/state at run time.
  if (apiKey && apiKey.monthlyCapAwuCredits !== null) {
    const launchResult = await launchReconcileApiKeyCreditStateWorkflow({
      workspaceId: workspace.sId,
      keyId: apiKey.id,
    });
    if (launchResult.isErr()) {
      logger.warn(
        {
          workspaceId: workspace.sId,
          keyName: apiKey.name,
          err: launchResult.error,
        },
        "[Metronome ApiKeyCap] failed to launch debounced reconcile"
      );
    }
  }
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

/**
 * Reconcile a single API key's credit state from live Metronome usage. Launched
 * (debounced) after a message that used a capped key emits its usage, so the
 * key gets flipped to `capped` / `on_pool` without relying on Metronome spend
 * alerts (which can't attribute by `api_key_name`). Best-effort: re-checks the
 * workspace / contract / key state at run time and logs on failure.
 */
export async function reconcileApiKeyCreditStateActivity(
  workspaceId: string,
  keyId: number
): Promise<void> {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace?.metronomeCustomerId) {
    return;
  }
  const subscription = await SubscriptionResource.fetchActiveByWorkspaceModelId(
    workspace.id
  );
  const metronomeContractId = subscription?.metronomeContractId ?? null;
  if (!metronomeContractId) {
    return;
  }
  const key = await KeyResource.fetchByWorkspaceAndId({
    workspace: renderLightWorkspaceType({ workspace }),
    id: keyId,
  });
  if (!key || key.monthlyCapAwuCredits === null) {
    return;
  }

  const result = await reconcileApiKey({
    workspaceId: workspace.sId,
    metronomeCustomerId: workspace.metronomeCustomerId,
    metronomeContractId,
    key,
    execute: true,
  });
  if (result.isErr()) {
    logger.warn(
      { workspaceId: workspace.sId, keyName: key.name, err: result.error },
      "[Metronome ApiKeyCap] debounced reconcile failed"
    );
  }
}
