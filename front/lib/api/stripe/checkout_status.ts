import { getRedisCacheClient } from "@app/lib/api/redis";
import { z } from "zod";

const CHECKOUT_TTL_SECONDS = 200;
const CHECKOUT_KEY_PREFIX = "stripe:checkout:";
const CheckoutErrorSchema = z.object({ status: z.string() });

export async function storeStripeCheckoutSessionStatus({
  sessionId,
  status,
}: {
  sessionId: string;
  status: string;
}): Promise<void> {
  const redis = await getRedisCacheClient({
    origin: "stripe_checkout_status",
  });
  await redis.set(
    `${CHECKOUT_KEY_PREFIX}${sessionId}`,
    JSON.stringify({ status }),
    { EX: CHECKOUT_TTL_SECONDS }
  );
}

export async function getStripeCheckoutSessionStatus(
  sessionId: string
): Promise<{ status: string } | null> {
  const redis = await getRedisCacheClient({
    origin: "stripe_checkout_status",
  });
  const key = `${CHECKOUT_KEY_PREFIX}${sessionId}`;
  const raw = await redis.get(key);
  if (!raw) {
    return null;
  }
  await redis.del(key);
  const parsed = CheckoutErrorSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}
