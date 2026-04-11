import { Authenticator, type AuthenticatorType } from "@app/lib/auth";
import {
  CompactionMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import logger from "@app/logger/logger";

export async function runCompaction(
  authType: AuthenticatorType,
  {
    conversationId,
    compactionMessageId,
    compactionMessageVersion,
  }: {
    conversationId: string;
    compactionMessageId: string;
    compactionMessageVersion: number;
  }
): Promise<void> {
  const authResult = await Authenticator.fromJSON(authType);
  if (authResult.isErr()) {
    throw new Error(
      `Failed to deserialize authenticator: ${authResult.error.code}`
    );
  }

  const auth = authResult.value;
  const workspaceId = auth.getNonNullableWorkspace().id;

  const message = await MessageModel.findOne({
    where: {
      sId: compactionMessageId,
      version: compactionMessageVersion,
      workspaceId,
    },
    include: [
      {
        model: CompactionMessageModel,
        as: "compactionMessage",
        required: true,
      },
    ],
  });

  if (!message?.compactionMessage) {
    throw new Error(
      `Compaction message not found for message ${compactionMessageId} (workspace=${workspaceId}, conversation=${conversationId})`
    );
  }

  const compactionMessage = message.compactionMessage;

  try {
    // TODO(compaction): implement actual compaction (fetch messages, call LLM, generate summary).
    await compactionMessage.update({
      status: "succeeded",
      content: "[COMPACTION]",
    });

    logger.info(
      { workspaceId, conversationId, compactionMessageId },
      "Compaction completed"
    );
  } catch (error) {
    await compactionMessage.update({ status: "failed" });

    logger.error(
      { workspaceId, conversationId, compactionMessageId, error },
      "Compaction failed"
    );

    throw error;
  }
}
