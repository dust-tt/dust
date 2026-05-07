import { getRedisCacheClient } from "@app/lib/api/redis";
import { z } from "zod";

const CHECKOUT_ERROR_TTL_SECONDS = 60;
const CHECKOUT_ERROR_KEY_PREFIX = "metronome:checkout:error:";
const CheckoutErrorSchema = z.object({ message: z.string() });

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
  const key = `${CHECKOUT_ERROR_KEY_PREFIX}${sessionId}`;
  const raw = await redis.get(key);
  if (!raw) {
    return null;
  }
  await redis.del(key);
  const parsed = CheckoutErrorSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}
