import { postUserMessage } from "@app/lib/api/assistant/conversation";
import { type Authenticator, getFeatureFlags } from "@app/lib/auth";
import { ConversationGoalResource } from "@app/lib/resources/conversation_goal_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import type { GoalType } from "@app/types/assistant/goal";
import { assertNever } from "@app/types/shared/utils/assert_never";

export type GoalContinuationOutcome =
  | "continued"
  | "already_processed"
  | "inactive"
  | "not_succeeded"
  | "paused";

const GOAL_CONTINUATION_MESSAGE =
  "Continue working toward the active goal. Review the conversation and prior progress, then take the next concrete steps. Do not repeat completed work. Use update_goal only when the full goal is complete and verified, or when a genuine blocker prevents further progress.";

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
    continuationGoalId: goal.sId,
    awaitWorkflowLaunch: true,
  });
  return result.isOk() && result.value.agentMessages.length === 1
    ? "continued"
    : "inactive";
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
      return decision.type;
    case "turn_limit_reached":
      return "paused";
    case "continue":
      break;
    default:
      return assertNever(decision);
  }

  const conversation = await ConversationResource.fetchById(
    auth,
    agentLoopArgs.conversationId
  );
  return conversation
    ? startActiveGoalTurn(auth, { conversation, goal: decision.goal })
    : "inactive";
}
