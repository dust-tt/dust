import { postUserMessage } from "@app/lib/api/assistant/conversation";
import { type Authenticator, getFeatureFlags } from "@app/lib/auth";
import {
  ConversationGoalResource,
  type GoalTransitionError,
} from "@app/lib/resources/conversation_goal_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import type { GoalType } from "@app/types/assistant/goal";
import type { Result } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export type GoalContinuationOutcome =
  | "continued"
  | "already_processed"
  | "inactive"
  | "newer_message"
  | "not_succeeded"
  | "paused";

const GOAL_CONTINUATION_MESSAGE =
  "Continue working toward the active goal. Review the conversation and prior progress, then take the next concrete steps. Do not repeat completed work. Use update_goal only when the full goal is complete and verified, or when a genuine blocker prevents further progress.";

async function pauseFailedGoalTurn(
  auth: Authenticator,
  {
    conversation,
    goal,
  }: {
    conversation: ConversationResource;
    goal: ConversationGoalResource;
  }
): Promise<boolean> {
  const applied = await goal.failCurrentTurn(auth, {
    conversation,
    reason: "continuation_failed",
  });
  if (applied) {
    await ConversationResource.setIsRunningAgentLoop(auth, {
      conversation: conversation.toJSON(),
      isRunningAgentLoop: false,
    });
  }
  return applied;
}

async function launchGoalTurn(
  auth: Authenticator,
  {
    conversation,
    goal,
    agentLoopArgs,
  }: {
    conversation: ConversationResource;
    goal: ConversationGoalResource;
    agentLoopArgs: AgentLoopArgs;
  }
): Promise<GoalContinuationOutcome> {
  await ConversationResource.setIsRunningAgentLoop(auth, {
    conversation: conversation.toJSON(),
    isRunningAgentLoop: true,
  });
  try {
    await launchAgentLoopWorkflow({ auth, agentLoopArgs, startStep: 0 });
    return "continued";
  } catch (error) {
    await pauseFailedGoalTurn(auth, { conversation, goal });
    logger.error(
      {
        error: normalizeError(error),
        conversationId: conversation.sId,
        goalId: goal.sId,
      },
      "Failed to launch a goal turn"
    );
    return "paused";
  }
}

async function ensureCurrentGoalTurn(
  auth: Authenticator,
  {
    conversation,
    goal,
  }: {
    conversation: ConversationResource;
    goal: GoalType;
  }
): Promise<GoalContinuationOutcome> {
  const activeGoal = await ConversationGoalResource.fetchLatest(auth, {
    conversation,
    branchId: goal.branchId,
  });
  if (activeGoal?.sId !== goal.sId || activeGoal.status !== "active") {
    return "paused";
  }
  const recovery = await activeGoal.fetchTurnRecovery(auth, { conversation });
  switch (recovery.type) {
    case "already_succeeded":
      return "continued";
    case "unavailable":
      await pauseFailedGoalTurn(auth, { conversation, goal: activeGoal });
      return "paused";
    case "restart":
      return launchGoalTurn(auth, {
        conversation,
        goal: activeGoal,
        agentLoopArgs: recovery.agentLoopArgs,
      });
    default:
      return assertNever(recovery);
  }
}

export async function startActiveGoalTurn(
  auth: Authenticator,
  {
    conversation,
    goal,
  }: {
    conversation: ConversationResource;
    goal: GoalType;
  }
): Promise<GoalContinuationOutcome> {
  const activeGoal = await ConversationGoalResource.fetchLatest(auth, {
    conversation,
    branchId: goal.branchId,
  });
  if (activeGoal?.sId !== goal.sId || activeGoal.status !== "active") {
    return "paused";
  }
  const expectedCurrentAgentMessageModelId = activeGoal.currentAgentMessageId;
  const user = auth.getNonNullableUser();
  const result = await postUserMessage(auth, {
    conversationResource: conversation,
    branchId: goal.branchId,
    content: GOAL_CONTINUATION_MESSAGE,
    mentions: [{ configurationId: goal.agentConfigurationId }],
    context: {
      timezone: "Etc/UTC",
      username: user.username,
      fullName: user.fullName(),
      email: user.email,
      profilePictureUrl: user.imageUrl,
      origin: "goal_continuation",
      clientSideMCPServerIds: [],
      selectedSpaceIds: [],
    },
    skipToolsValidation: false,
    skipDustAutoMention: true,
    doNotAssociateUser: true,
    continuationGoal: activeGoal,
    deferAgentLoopWorkflow: true,
  });
  const latest = await ConversationGoalResource.fetchLatest(auth, {
    conversation,
    branchId: goal.branchId,
  });
  if (
    result.isOk() &&
    result.value.agentMessages.length === 1 &&
    latest?.sId === goal.sId &&
    latest.status === "active" &&
    latest.currentAgentMessageId !== expectedCurrentAgentMessageModelId
  ) {
    const agentMessage = result.value.agentMessages[0];
    return launchGoalTurn(auth, {
      conversation,
      goal: latest,
      agentLoopArgs: {
        agentMessageId: agentMessage.sId,
        agentMessageVersion: agentMessage.version,
        conversationId: conversation.sId,
        conversationBranchId: goal.branchId,
        conversationTitle: conversation.title,
        userMessageId: result.value.userMessage.sId,
        userMessageVersion: result.value.userMessage.version,
        userMessageOrigin: result.value.userMessage.context.origin,
      },
    });
  }
  if (
    latest?.sId === goal.sId &&
    latest.status === "active" &&
    latest.currentAgentMessageId !== expectedCurrentAgentMessageModelId
  ) {
    return "continued";
  }

  logger.error(
    {
      conversationId: conversation.sId,
      goalId: goal.sId,
      errorType: result.isErr()
        ? result.error.api_error.type
        : "missing_agent_message",
    },
    "Failed to create the next goal turn"
  );
  await pauseFailedGoalTurn(auth, { conversation, goal: activeGoal });
  return "paused";
}

export async function continueActiveGoal(
  auth: Authenticator,
  agentLoopArgs: AgentLoopArgs
): Promise<GoalContinuationOutcome> {
  const featureFlags = await getFeatureFlags(auth);
  if (!featureFlags.includes("goal_mode")) {
    return "inactive";
  }

  const decision = await ConversationGoalResource.claimContinuation(auth, {
    conversationId: agentLoopArgs.conversationId,
    conversationBranchId: agentLoopArgs.conversationBranchId,
    agentMessageId: agentLoopArgs.agentMessageId,
  });
  switch (decision.type) {
    case "inactive":
    case "not_succeeded":
    case "already_processed":
    case "newer_message":
      return decision.type;
    case "turn_limit_reached":
      return "paused";
    case "ensure_current":
      break;
    case "continue":
      break;
    default:
      return assertNever(decision);
  }

  const conversation = await ConversationResource.fetchById(
    auth,
    agentLoopArgs.conversationId
  );
  if (!conversation) {
    await ConversationGoalResource.pauseForAgentMessage(auth, {
      conversationId: agentLoopArgs.conversationId,
      conversationBranchId: agentLoopArgs.conversationBranchId,
      agentMessageId: agentLoopArgs.agentMessageId,
      reason: "conversation_unavailable",
    });
    return "paused";
  }
  return decision.type === "ensure_current"
    ? ensureCurrentGoalTurn(auth, { conversation, goal: decision.goal })
    : startActiveGoalTurn(auth, { conversation, goal: decision.goal });
}

export function pauseGoalByUser(
  auth: Authenticator,
  {
    conversation,
    branchId,
  }: {
    conversation: ConversationResource;
    branchId: string | null;
  }
): Promise<Result<ConversationGoalResource, GoalTransitionError>> {
  return ConversationGoalResource.pauseByUser(auth, {
    conversation,
    branchId,
  });
}
