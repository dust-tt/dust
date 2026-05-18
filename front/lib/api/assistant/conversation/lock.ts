import type { Authenticator } from "@app/lib/auth";
import { MessageModel } from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { md5 } from "@app/types/shared/utils/encryption";
import type { Transaction } from "sequelize";

/**
 * To avoid deadlocks when using Postgresql advisory locks, please make sure to not issue any other
 * SQL query outside of the transaction `t` that is holding the lock.
 * Otherwise, the other query will be competing for a connection in the database connection pool,
 * resulting in a potential deadlock when the pool is fully occupied.
 */
export async function getConversationRankVersionLock(
  auth: Authenticator,
  conversation: ConversationWithoutContentType,
  t: Transaction
) {
  const now = new Date();
  // Get a lock using the unique lock key (number withing postgresql BigInt range).
  const hash = md5(`conversation_message_rank_version_${conversation.id}`);
  const lockKey = parseInt(hash, 16) % 9999999999;
  // biome-ignore lint/plugin/noRawSql: advisory lock requires raw SQL
  await frontSequelize.query("SELECT pg_advisory_xact_lock(:key)", {
    transaction: t,
    replacements: { key: lockKey },
  });

  logger.info(
    {
      workspaceId: auth.getNonNullableWorkspace().sId,
      conversationId: conversation.sId,
      duration: new Date().getTime() - now.getTime(),
      lockKey,
    },
    "[ASSISTANT_TRACE] Advisory lock acquired"
  );
}

export async function getNextConversationMessageRank(
  auth: Authenticator,
  {
    conversation,
    transaction,
  }: {
    conversation: ConversationWithoutContentType;
    transaction: Transaction;
  }
): Promise<number> {
  const owner = auth.getNonNullableWorkspace();

  return (
    ((await MessageModel.max<number | null, MessageModel>("rank", {
      where: {
        workspaceId: owner.id,
        conversationId: conversation.id,
        branchId: conversation.branchId
          ? getResourceIdFromSId(conversation.branchId)
          : null,
      },
      transaction,
    })) ?? -1) + 1
  );
}
