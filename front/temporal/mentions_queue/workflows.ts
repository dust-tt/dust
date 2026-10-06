import type { NewCommentMessage } from "@app/lib/api/files/dfm_comment_signatures";
import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/mentions_queue/activities";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import { proxyActivities } from "@temporalio/workflow";

const { handleMentionsActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
  retry: {
    maximumAttempts: 2,
  },
});

// A busy conversation is retried until it is idle, for about an hour.
const { postDocumentCommentMentionActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "15 seconds",
    backoffCoefficient: 2,
    maximumInterval: "5 minutes",
    maximumAttempts: 18,
  },
});

export async function handleMentionsWorkflow(
  authType: AuthenticatorType,
  {
    agentLoopArgs,
  }: {
    agentLoopArgs: AgentLoopArgs;
  }
): Promise<void> {
  await handleMentionsActivity(authType, agentLoopArgs);
}

export async function documentCommentMentionWorkflow(
  authType: AuthenticatorType,
  {
    documentPath,
    newMessage,
  }: {
    documentPath: string;
    newMessage: NewCommentMessage;
  }
): Promise<void> {
  await postDocumentCommentMentionActivity(authType, {
    documentPath,
    newMessage,
  });
}
