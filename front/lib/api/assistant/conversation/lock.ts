import type { Authenticator } from "@app/lib/auth";
import { MessageModel } from "@app/lib/models/agent/conversation";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import logger from "@app/logger/logger";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { md5 } from "@app/types/shared/utils/encryption";
import type { Transaction } from "sequelize";

async function takeConversationLock(
  conversationId: number,
  transaction: Transaction
): Promise<number> {
  // Get a lock using the unique lock key (number within PostgreSQL's BigInt range).
  const hash = md5(`conversation_message_rank_version_${conversationId}`);
  const lockKey = parseInt(hash, 16) % 9999999999;
  // biome-ignore lint/plugin/noRawSql: advisory lock requires raw SQL
  await frontSequelize.query("SELECT pg_advisory_xact_lock(:key)", {
    transaction,
    replacements: { key: lockKey },
  });
  return lockKey;
}

/**
 * To avoid deadlocks when using Postgresql advisory locks, please make sure to not issue any other
 * SQL query outside of the transaction `t` that is holding the lock.
 * Otherwise, the other query will be competing for a connection in the database connection pool,
 * resulting in a potential deadlock when the pool is fully occupied.
 */
export async function getConversationRankVersionLock(
  auth: Authenticator,
  conversation: ConversationWithoutContentType | ConversationResource,
  t: Transaction
) {
  const startMs = performance.now();
  const lockKey = await takeConversationLock(conversation.id, t);

  const acquiredAtMs = performance.now();

  logger.info(
    {
      workspaceId: auth.getNonNullableWorkspace().sId,
      conversationId: conversation.sId,
      waitMs: acquiredAtMs - startMs,
      lockKey,
    },
    "[ASSISTANT_TRACE] Advisory lock acquired"
  );

  t.afterCommit(() => {
    logger.info(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        conversationId: conversation.sId,
        heldMs: performance.now() - acquiredAtMs,
        lockKey,
      },
      "[ASSISTANT_TRACE] Advisory lock released"
    );
  });
}

export async function getConversationLockById(
  conversationId: number,
  transaction: Transaction
): Promise<void> {
  await takeConversationLock(conversationId, transaction);
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
      },
      transaction,
    })) ?? -1) + 1
  );
}
