import {
  CheckoutBillingPeriodSchema,
  CheckoutSeatTypeSchema,
} from "@app/lib/api/checkout/types";
import { runOnRedisCache } from "@app/lib/api/redis";
import logger from "@app/logger/logger";
import { z } from "zod";

const REDIS_ORIGIN = "checkout_payment_status";

export type CheckoutPaymentStatus = "pending" | "succeeded" | "failed";

export const CheckoutPaymentSchema = z.object({
  status: z.enum(["pending", "succeeded", "failed"]),
  workspaceId: z.string(),
  contractId: z.string(),
  userId: z.string(),
  targetUserId: z.string(),
  seatType: CheckoutSeatTypeSchema,
  billingPeriod: CheckoutBillingPeriodSchema,
  currency: z.enum(["usd", "eur"]),
  initialAmountCents: z.number(),
  couponCode: z.string().optional(),
  couponRedemptionId: z.string().optional(),
  uniquenessKey: z.string(),
  createdAtMs: z.number(),
  invoiceId: z.string().optional(),
  errorMessage: z.string().optional(),
});

export type CheckoutPayment = z.infer<typeof CheckoutPaymentSchema>;

// 1 hour: matches a generous bound on the webhook delivery / UI polling
const TTL_SECONDS = 60 * 60;

function redisKey(workspaceId: string, contractId: string): string {
  return `checkout_payment:${workspaceId}:${contractId}`;
}

export async function setCheckoutPaymentPending(
  input: Omit<CheckoutPayment, "status" | "createdAtMs">
): Promise<void> {
  const payment: CheckoutPayment = {
    ...input,
    status: "pending",
    createdAtMs: Date.now(),
  };
  await runOnRedisCache({ origin: REDIS_ORIGIN }, async (cli) => {
    await cli.set(
      redisKey(input.workspaceId, input.contractId),
      JSON.stringify(payment),
      { EX: TTL_SECONDS }
    );
  });
}

export async function getCheckoutPaymentStatus({
  workspaceId,
  contractId,
}: {
  workspaceId: string;
  contractId: string;
}): Promise<CheckoutPayment | null> {
  return runOnRedisCache({ origin: REDIS_ORIGIN }, async (cli) => {
    const raw = await cli.get(redisKey(workspaceId, contractId));
    if (!raw) {
      return null;
    }
    const parsed = CheckoutPaymentSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      logger.warn(
        { workspaceId, contractId },
        "[Checkout Payment Status] Stored payment failed schema validation"
      );
      return null;
    }
    return parsed.data;
  });
}

async function updatePayment(
  workspaceId: string,
  contractId: string,
  apply: (current: CheckoutPayment) => CheckoutPayment
): Promise<CheckoutPayment | null> {
  return runOnRedisCache({ origin: REDIS_ORIGIN }, async (cli) => {
    const raw = await cli.get(redisKey(workspaceId, contractId));
    if (!raw) {
      return null;
    }
    const parsedCurrent = CheckoutPaymentSchema.safeParse(JSON.parse(raw));
    if (!parsedCurrent.success) {
      return null;
    }
    const current = parsedCurrent.data;
    // Idempotency: if already succeeded, do not overwrite.
    if (current.status === "succeeded") {
      return current;
    }
    const updated = apply(current);
    await cli.set(redisKey(workspaceId, contractId), JSON.stringify(updated), {
      EX: TTL_SECONDS,
    });
    return updated;
  });
}

export async function markCheckoutPaymentSucceeded({
  workspaceId,
  contractId,
  invoiceId,
}: {
  workspaceId: string;
  contractId: string;
  invoiceId: string;
}): Promise<CheckoutPayment | null> {
  return updatePayment(workspaceId, contractId, (current) => ({
    ...current,
    status: "succeeded",
    invoiceId,
  }));
}

export async function markCheckoutPaymentFailed({
  workspaceId,
  contractId,
  errorMessage,
  invoiceId,
}: {
  workspaceId: string;
  contractId: string;
  errorMessage: string;
  invoiceId?: string;
}): Promise<CheckoutPayment | null> {
  return updatePayment(workspaceId, contractId, (current) => ({
    ...current,
    status: "failed",
    errorMessage,
    invoiceId: invoiceId ?? current.invoiceId,
  }));
}

// Used when the Metronome call fails synchronously (no webhook will fire).
// Unconditional overwrite of the entry we just wrote.
export async function recordCheckoutPaymentSyncFailure({
  workspaceId,
  contractId,
  errorMessage,
}: {
  workspaceId: string;
  contractId: string;
  errorMessage: string;
}): Promise<void> {
  await runOnRedisCache({ origin: REDIS_ORIGIN }, async (cli) => {
    const raw = await cli.get(redisKey(workspaceId, contractId));
    if (!raw) {
      return;
    }
    const parsedCurrent = CheckoutPaymentSchema.safeParse(JSON.parse(raw));
    if (!parsedCurrent.success) {
      return;
    }
    const current = parsedCurrent.data;
    const updated: CheckoutPayment = {
      ...current,
      status: "failed",
      errorMessage,
    };
    await cli.set(redisKey(workspaceId, contractId), JSON.stringify(updated), {
      EX: TTL_SECONDS,
    });
  });
}
