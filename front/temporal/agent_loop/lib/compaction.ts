import { updateCompactionMessageWithFinalStatus } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { PREVIOUS_INTERACTIONS_TO_PRESERVE } from "@app/lib/api/assistant/conversation_rendering";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import {
  type CompactionMessageType,
  isCompactionMessageType,
} from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export async function runCompaction(
  auth: Authenticator,
  {
    conversationId,
    compactionMessageId,
    compactionMessageVersion,
  }: {
    conversationId: string;
    compactionMessageId: string;
    compactionMessageVersion: number;
  }
): Promise<Result<void, Error>> {
  const owner = auth.getNonNullableWorkspace();

  const conversationRes = await getConversation(
    auth,
    conversationId,
    false,
    null,
    PREVIOUS_INTERACTIONS_TO_PRESERVE + 1 // X previous + the last one
  );
  if (conversationRes.isErr()) {
    return conversationRes;
  }
  const conversation = conversationRes.value;

  let compactionMessage: CompactionMessageType | undefined;

  for (
    let i = conversation.content.length - 1;
    i >= 0 && !compactionMessage;
    i--
  ) {
    const messageGroup = conversation.content[i];
    for (const msg of messageGroup) {
      if (
        isCompactionMessageType(msg) &&
        msg.sId === compactionMessageId &&
        msg.version === compactionMessageVersion
      ) {
        compactionMessage = msg;
        break;
      }
    }
  }

  if (!compactionMessage) {
    return new Err(new Error("Compaction message not found"));
  }

  // TODO(compaction): implement actual compaction

  const result = await updateCompactionMessageWithFinalStatus(auth, {
    conversation,
    compactionMessage,
    status: "succeeded",
  });

  compactionMessage.status = result.status;

  logger.info(
    { workspaceId: owner.sId, conversationId, compactionMessageId },
    "Compaction completed"
  );

  return new Ok(undefined);
}
