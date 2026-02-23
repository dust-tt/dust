import { getRedisStreamClient } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { APIErrorWithStatusCode } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const MESSAGE_IDEMPOTENCY_WINDOW_SECONDS = 30;
const MESSAGE_IDEMPOTENCY_KEY_HEADER = "x-idempotency-key";
const MAX_MESSAGE_IDEMPOTENCY_KEY_LENGTH = 255;

type MessagePostRequestLike = {
  headers: Record<string, string | string[] | undefined>;
};

const getMessageIdempotencyRedisKey = (
  workspaceId: string,
  userId: string,
  conversationId: string,
  idempotencyKey: string
) => {
  return `message-idempotency:${workspaceId}:${userId}:${conversationId}:${idempotencyKey}`;
};

export function getMessageIdempotencyKey(
  req: MessagePostRequestLike
): Result<string | null, APIErrorWithStatusCode> {
  const idempotencyKey = req.headers[MESSAGE_IDEMPOTENCY_KEY_HEADER];

  if (idempotencyKey === undefined) {
    return new Ok(null);
  }

  if (
    typeof idempotencyKey !== "string" ||
    idempotencyKey.length === 0 ||
    idempotencyKey.length > MAX_MESSAGE_IDEMPOTENCY_KEY_LENGTH
  ) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Invalid X-Idempotency-Key header. It must be a non-empty string " +
          `up to ${MAX_MESSAGE_IDEMPOTENCY_KEY_LENGTH} characters.`,
      },
    });
  }

  return new Ok(idempotencyKey);
}

export async function ensureMessageIdempotency(
  auth: Authenticator,
  {
    conversationId,
    idempotencyKey,
  }: {
    conversationId: string;
    idempotencyKey: string | null;
  }
): Promise<Result<void, APIErrorWithStatusCode>> {
  if (!idempotencyKey) {
    return new Ok(undefined);
  }

  const workspace = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser();

  try {
    const redis = await getRedisStreamClient({ origin: "user_message_events" });
    const redisKey = getMessageIdempotencyRedisKey(
      workspace.sId,
      user.sId,
      conversationId,
      idempotencyKey
    );

    const setResult = await redis.set(redisKey, "1", {
      NX: true,
      EX: MESSAGE_IDEMPOTENCY_WINDOW_SECONDS,
    });

    if (setResult === "OK") {
      return new Ok(undefined);
    }

    return new Err({
      status_code: 409,
      api_error: {
        type: "invalid_request_error",
        message: "Duplicate message request detected.",
      },
    });
  } catch (err) {
    logger.error(
      {
        workspaceId: workspace.sId,
        userId: user.sId,
        conversationId,
        err,
      },
      "Failed to enforce message idempotency; allowing request."
    );
    return new Ok(undefined);
  }
}
