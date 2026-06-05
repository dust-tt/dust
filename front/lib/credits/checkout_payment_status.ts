import type {
  CheckoutBillingPeriod,
  CheckoutSeatType,
} from "@app/lib/api/checkout/types";
import { runOnRedisCache } from "@app/lib/api/redis";
import logger from "@app/logger/logger";

const REDIS_ORIGIN = "checkout_payment_status";

export type CheckoutPaymentStatus = "pending" | "succeeded" | "failed";

export type CheckoutPayment = {
  status: CheckoutPaymentStatus;
  workspaceId: string;
  contractId: string;
  userId: string;
  targetUserId: string;
  seatType: CheckoutSeatType;
  billingPeriod: CheckoutBillingPeriod;
  currency: "usd" | "eur";
  initialAmountCents: number;
  couponCode?: string;
  couponRedemptionId?: string;
  uniquenessKey: string;
  createdAtMs: number;
  invoiceId?: string;
  errorMessage?: string;
};

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
    try {
      return JSON.parse(raw) as CheckoutPayment;
    } catch (err) {
      logger.warn(
        { workspaceId, contractId, err },
        "[Checkout Payment Status] Failed to parse stored payment"
      );
      return null;
    }
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
    let current: CheckoutPayment;
    try {
      current = JSON.parse(raw) as CheckoutPayment;
    } catch {
      return null;
    }
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
    let current: CheckoutPayment;
    try {
      current = JSON.parse(raw) as CheckoutPayment;
    } catch {
      return;
    }
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
