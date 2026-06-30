import { closeActivePlan } from "@app/lib/api/assistant/plan_mode";
import { copyConversationGCSMount } from "@app/lib/api/files/gcs_mount/files";
import { Authenticator } from "@app/lib/auth";
import { ConversationForkResource } from "@app/lib/resources/conversation_fork_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";

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
      await ConversationForkResource.markFileCopied(auth, {
        childConversationModelId: dest.id,
      });
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

  // The source plan (todos) was copied into the fork as an active `plan.md`. Archive it on the
  // fork so the new conversation does not start with the parent's todo card while still keeping
  // the plan available in `archived_plans` (same behavior as closing a plan).
  const archiveRes = await closeActivePlan(auth, dest.toJSON());
  if (archiveRes.isErr()) {
    logger.error(
      {
        workspaceId,
        sourceConversationId,
        destConversationId,
        error: archiveRes.error,
      },
      "[conversation_fork_queue] Failed to archive forked plan. Unblocking fork."
    );
  }

  await ConversationForkResource.markFileCopied(auth, {
    childConversationModelId: dest.id,
  });
}
