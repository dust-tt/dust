import type { NewCommentMessage } from "@app/lib/api/files/dfm_comment_signatures";
import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/mentions_queue/activities";
import { CONVERSATION_BUSY_FAILURE_TYPE } from "@app/temporal/mentions_queue/config";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import {
  ActivityFailure,
  ApplicationFailure,
  proxyActivities,
  sleep,
} from "@temporalio/workflow";

const { handleMentionsActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
  retry: {
    maximumAttempts: 2,
  },
});

// An attempt that fails or times out may have posted, so it is never retried.
const { postDocumentCommentMentionActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "2 minutes",
  retry: {
    maximumAttempts: 1,
  },
});

const MAX_BUSY_ATTEMPTS = 18;
const FIRST_BUSY_DELAY_MS = 15_000;
const MAX_BUSY_DELAY_MS = 5 * 60_000;

function isConversationBusyFailure(error: unknown): boolean {
  return (
    error instanceof ActivityFailure &&
    error.cause instanceof ApplicationFailure &&
    error.cause.type === CONVERSATION_BUSY_FAILURE_TYPE
  );
}

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
  for (let attempt = 1; ; attempt++) {
    try {
      await postDocumentCommentMentionActivity(authType, {
        documentPath,
        newMessage,
      });
      return;
    } catch (error) {
      if (!isConversationBusyFailure(error) || attempt >= MAX_BUSY_ATTEMPTS) {
        throw error;
      }
    }
    await sleep(
      Math.min(FIRST_BUSY_DELAY_MS * 2 ** (attempt - 1), MAX_BUSY_DELAY_MS)
    );
  }
}
