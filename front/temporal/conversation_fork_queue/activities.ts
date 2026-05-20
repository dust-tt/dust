import { copyConversationGCSMount } from "@app/lib/api/files/gcs_mount/files";
import { Authenticator } from "@app/lib/auth";
import { ConversationForkResource } from "@app/lib/resources/conversation_fork_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";

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
      await ConversationForkResource.markFileCopied(auth, {
        childConversationModelId: dest.id,
      });
    }

    return;
  }

  const result = await copyConversationGCSMount(auth, { source, dest });
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

  await ConversationForkResource.markFileCopied(auth, {
    childConversationModelId: dest.id,
  });
}
