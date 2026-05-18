import { failCompactionMessageIfCreated } from "@app/lib/api/assistant/conversation/compaction";
import { publishConversationEvent } from "@app/lib/api/assistant/streaming/events";
import { copyConversationGCSMount } from "@app/lib/api/files/gcs_mount/files";
import { Authenticator, type AuthenticatorType } from "@app/lib/auth";
import { ConversationForkResource } from "@app/lib/resources/conversation_fork_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { ApplicationFailure } from "@temporalio/common";

export { compactionActivity } from "@app/temporal/agent_loop/activities/compaction";

export async function copyConversationGCSMountActivity({
  workspaceId,
  sourceConversationId,
  destConversationId,
}: {
  workspaceId: string;
  sourceConversationId: string;
  destConversationId: string;
}): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

  const [source, dest] = await Promise.all([
    ConversationResource.fetchById(auth, sourceConversationId),
    ConversationResource.fetchById(auth, destConversationId),
  ]);

  if (!source || !dest) {
    throw ApplicationFailure.nonRetryable(
      `[conversation_fork_queue] Source or destination conversation not found: sourceFound=${!!source} destFound=${!!dest}`
    );
  }

  const result = await copyConversationGCSMount(auth, { source, dest });
  if (result.isErr()) {
    throw result.error;
  }

  await ConversationForkResource.markGcsMountCopied(auth, {
    childConversationModelId: dest.id,
  });

  logger.info(
    {
      workspaceId,
      sourceConversationId,
      destConversationId,
      copiedCount: result.value.copiedCount,
    },
    "[conversation_fork_queue] Copied GCS mount files between conversations."
  );
}

export async function failForkCompactionMessageActivity(
  authType: AuthenticatorType,
  {
    conversationId,
    compactionMessageId,
  }: {
    conversationId: string;
    compactionMessageId: string;
  }
): Promise<void> {
  const authResult = await Authenticator.fromJSON(authType);
  if (authResult.isErr()) {
    logger.error(
      { error: authResult.error, conversationId, compactionMessageId },
      "[conversation_fork_queue] Failed to deserialize authenticator for compaction message failure."
    );
    return;
  }

  const auth = authResult.value;

  const failedMessage = await failCompactionMessageIfCreated(auth, {
    compactionMessageId,
  });

  if (failedMessage) {
    await publishConversationEvent(
      {
        type: "compaction_message_done",
        created: Date.now(),
        messageId: failedMessage.sId,
        message: failedMessage,
      },
      { conversationId }
    );

    logger.info(
      { conversationId, compactionMessageId },
      "[conversation_fork_queue] Failed compaction message for fork workflow failure."
    );
  }
}
