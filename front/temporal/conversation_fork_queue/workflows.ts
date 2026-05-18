import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/conversation_fork_queue/activities";
import type { CompactionSourceConversation } from "@app/types/assistant/compaction";
import type { SupportedModel } from "@app/types/assistant/models/types";
import { proxyActivities } from "@temporalio/workflow";

const { copyConversationGCSMountActivity, failForkCompactionMessageActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "10 minutes",
    retry: {
      maximumAttempts: 3,
      initialInterval: "5s",
      backoffCoefficient: 2,
      maximumInterval: "1m",
    },
  });

// Compaction is not idempotent: do not retry on failure.
const { compactionActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  retry: { maximumAttempts: 1 },
});

export async function conversationForkWorkflow({
  workspaceId,
  sourceConversationId,
  destConversationId,
  authType,
  compactionMessageId,
  compactionMessageVersion,
  model,
  sourceConversation,
}: {
  workspaceId: string;
  sourceConversationId: string;
  destConversationId: string;
  authType?: AuthenticatorType;
  compactionMessageId?: string;
  compactionMessageVersion?: number;
  model?: SupportedModel;
  sourceConversation?: CompactionSourceConversation;
}): Promise<void> {
  if (
    authType !== undefined &&
    compactionMessageId !== undefined &&
    compactionMessageVersion !== undefined &&
    model !== undefined
  ) {
    try {
      await Promise.all([
        copyConversationGCSMountActivity({
          workspaceId,
          sourceConversationId,
          destConversationId,
        }),
        compactionActivity(authType, {
          conversationId: destConversationId,
          compactionMessageId,
          compactionMessageVersion,
          model,
          sourceConversation,
        }),
      ]);
    } catch (e) {
      try {
        await failForkCompactionMessageActivity(authType, {
          conversationId: destConversationId,
          compactionMessageId,
        });
      } catch {
        // best-effort cleanup; original error is still rethrown below
      }
      throw e;
    }
  } else {
    await copyConversationGCSMountActivity({
      workspaceId,
      sourceConversationId,
      destConversationId,
    });
  }
}
