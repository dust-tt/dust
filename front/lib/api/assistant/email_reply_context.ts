import type { RedisUsageTagsType } from "@app/lib/api/redis";
import { getRedisClient } from "@app/lib/api/redis";
import logger from "@app/logger/logger";

const REDIS_ORIGIN: RedisUsageTagsType = "message_events";
const EMAIL_REPLY_CONTEXT_PREFIX = "email-reply-context";
const EMAIL_REPLY_CONTEXT_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Data needed to reply to an email after agent message completion.
 */
export type EmailReplyContext = {
  subject: string;
  originalText: string;
  fromEmail: string;
  fromFull: string;
  agentConfigurationSId: string;
  workspaceSId: string;
  conversationSId: string;
};

function makeEmailReplyContextKey(agentMessageSId: string): string {
  return `${EMAIL_REPLY_CONTEXT_PREFIX}:${agentMessageSId}`;
}

/**
 * Store email reply context in Redis for later use when agent message completes.
 */
export async function storeEmailReplyContext(
  agentMessageSId: string,
  context: EmailReplyContext
): Promise<void> {
  const redis = await getRedisClient({ origin: REDIS_ORIGIN });
  const key = makeEmailReplyContextKey(agentMessageSId);

  await redis.set(key, JSON.stringify(context), {
    EX: EMAIL_REPLY_CONTEXT_TTL_SECONDS,
  });

  logger.info(
    { agentMessageSId, key },
    "[email] Stored email reply context in Redis"
  );
}

/**
 * Retrieve and delete email reply context from Redis.
 * Returns null if not found (expired or never stored).
 */
export async function getAndDeleteEmailReplyContext(
  agentMessageSId: string
): Promise<EmailReplyContext | null> {
  const redis = await getRedisClient({ origin: REDIS_ORIGIN });
  const key = makeEmailReplyContextKey(agentMessageSId);

  const value = await redis.get(key);
  if (!value) {
    return null;
  }

  // Delete after retrieval to ensure we only reply once.
  await redis.del(key);

  try {
    return JSON.parse(value) as EmailReplyContext;
  } catch {
    logger.warn(
      { agentMessageSId, key },
      "[email] Failed to parse email reply context from Redis"
    );
    return null;
  }
}

/**
 * Delete email reply context from Redis without retrieving it.
 * Used for cleanup on error/cancellation.
 */
export async function deleteEmailReplyContext(
  agentMessageSId: string
): Promise<void> {
  const redis = await getRedisClient({ origin: REDIS_ORIGIN });
  const key = makeEmailReplyContextKey(agentMessageSId);
  await redis.del(key);
}
