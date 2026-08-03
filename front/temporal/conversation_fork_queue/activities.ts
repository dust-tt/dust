import { publishConversationEvent } from "@app/lib/api/assistant/streaming/events";
import { copyConversationGCSMount } from "@app/lib/api/files/gcs_mount/files";
import { Authenticator } from "@app/lib/auth";
import { ConversationForkResource } from "@app/lib/resources/conversation_fork_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";

async function markForkPrepared(
  auth: Authenticator,
  conversation: ConversationResource
): Promise<void> {
  await ConversationForkResource.markFileCopied(auth, {
    childConversationModelId: conversation.id,
  });
  await publishConversationEvent(
    { type: "conversation_fork_prepared", created: Date.now() },
    { conversationId: conversation.sId }
  );
}

export async function copyConversationGCSMountActivity({
  workspaceId,
  sourceConversationId,
  destConversationId,
  sourceMessageTimestampMs,
}: {
  workspaceId: string;
  sourceConversationId: string;
  destConversationId: string;
  sourceMessageTimestampMs?: number;
}): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

  const [source, dest] = await Promise.all([
    ConversationResource.fetchById(auth, sourceConversationId),
    ConversationResource.fetchById(auth, destConversationId),
  ]);

  if (!source || !dest) {
    logger.warn(
      {
        workspaceId,
        sourceConversationId,
        destConversationId,
        sourceFound: !!source,
        destFound: !!dest,
      },
      "[conversation_fork_queue] Source or destination conversation not found. Skipping mount copy."
    );

    // Unblock the fork even if conversations are not found — nothing to copy.
    if (dest) {
      await markForkPrepared(auth, dest);
    } else {
      await ConversationForkResource.markFileCopiedByDestSId(auth, {
        childConversationSId: destConversationId,
      });
    }

    return;
  }

  const result = await copyConversationGCSMount(auth, {
    source,
    dest,
    sourceTimestampMs: sourceMessageTimestampMs,
  });
  if (result.isErr()) {
    // GCS copy failed. Log and unblock anyway — permanently blocking the fork
    // is worse than letting the user post with potentially missing files.
    logger.error(
      {
        workspaceId,
        sourceConversationId,
        destConversationId,
        error: result.error,
      },
      "[conversation_fork_queue] GCS mount copy failed. Unblocking fork."
    );
  } else {
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

  await markForkPrepared(auth, dest);
}
