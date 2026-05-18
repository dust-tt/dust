import { copyConversationGCSMount } from "@app/lib/api/files/gcs_mount/files";
import { Authenticator } from "@app/lib/auth";
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

    return;
  }

  const result = await copyConversationGCSMount(auth, { source, dest });
  if (result.isErr()) {
    throw result.error;
  }

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
