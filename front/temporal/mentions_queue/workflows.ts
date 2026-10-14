import type { NewCommentMessage } from "@app/lib/api/documents/comment_signatures";
import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/mentions_queue/activities";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import {
  ActivityFailure,
  ApplicationFailure,
  patched,
  proxyActivities,
  sleep,
} from "@temporalio/workflow";

import { CONVERSATION_BUSY_FAILURE_TYPE } from "./config";

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

const { notifyDocumentCommentMentionsActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "1 minute",
  retry: {
    maximumAttempts: 3,
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
  // TODO(2026-10-21): replace with deprecatePatch() once no run started before this patch
  // remains, then remove it a week later.
  if (patched("notify-document-comment-mentions")) {
    try {
      await notifyDocumentCommentMentionsActivity(authType, {
        documentPath,
        newMessage,
      });
    } catch (error) {
      if (!(error instanceof ActivityFailure)) {
        throw error;
      }
    }
  }

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
