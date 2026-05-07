import { getRedisCacheClient } from "@app/lib/api/redis";

const CHECKOUT_ERROR_TTL_SECONDS = 3600;
const CHECKOUT_ERROR_KEY_PREFIX = "metronome:checkout:error:";

export async function storeMetronomeCheckoutError({
  sessionId,
  message,
}: {
  sessionId: string;
  message: string;
}): Promise<void> {
  const redis = await getRedisCacheClient({
    origin: "metronome_checkout_error",
  });
  await redis.set(
    `${CHECKOUT_ERROR_KEY_PREFIX}${sessionId}`,
    JSON.stringify({ message }),
    { EX: CHECKOUT_ERROR_TTL_SECONDS }
  );
}

export async function getMetronomeCheckoutError(
  sessionId: string
): Promise<{ message: string } | null> {
  const redis = await getRedisCacheClient({
    origin: "metronome_checkout_error",
  });
  const raw = await redis.get(`${CHECKOUT_ERROR_KEY_PREFIX}${sessionId}`);
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as { message: string };
}
