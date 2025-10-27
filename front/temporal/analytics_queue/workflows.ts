import { proxyActivities } from "@temporalio/workflow";

import type { AgentMessageFeedbackType } from "@app/lib/api/assistant/feedback";
import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/analytics_queue/activities";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

const { storeAgentAnalyticsActivity, storeAgentMessageFeedbackActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    // Analytics is best effort, only retry twice.
    maximumAttempts: 2,
  },
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
    feedback,
    message,
  }: {
    feedback: AgentMessageFeedbackType;
    message: {
      agentMessageId: string;
      conversationId: string;
    };
  }
): Promise<void> {
  await storeAgentMessageFeedbackActivity(authType, {
    message,
    feedback: {
      feedback_id: feedback.id,
      user_id: feedback.userId.toString(),
      thumb_direction: feedback.thumbDirection,
      content: feedback.content ?? undefined,
      is_conversation_shared: feedback.isConversationShared,
      created_at: feedback.createdAt.toString(),
    }
  });
}
