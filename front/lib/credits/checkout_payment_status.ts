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
  setupSessionId: string;
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

function redisKey(workspaceId: string, setupSessionId: string): string {
  return `checkout_payment:${workspaceId}:${setupSessionId}`;
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
      redisKey(input.workspaceId, input.setupSessionId),
      JSON.stringify(payment),
      { EX: TTL_SECONDS }
    );
  });
}

export async function getCheckoutPaymentStatus({
  workspaceId,
  setupSessionId,
}: {
  workspaceId: string;
  setupSessionId: string;
}): Promise<CheckoutPayment | null> {
  return runOnRedisCache({ origin: REDIS_ORIGIN }, async (cli) => {
    const raw = await cli.get(redisKey(workspaceId, setupSessionId));
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as CheckoutPayment;
    } catch (err) {
      logger.warn(
        { workspaceId, setupSessionId, err },
        "[Checkout Payment Status] Failed to parse stored payment"
      );
      return null;
    }
  });
}

// Update the stored payment if (and only if) the contractId matches what was
// written at payment time. Mismatched contracts indicate stale webhook
// deliveries and must be ignored.
async function updatePaymentIfContractMatches(
  workspaceId: string,
  setupSessionId: string,
  contractId: string,
  apply: (current: CheckoutPayment) => CheckoutPayment
): Promise<CheckoutPayment | null> {
  return runOnRedisCache({ origin: REDIS_ORIGIN }, async (cli) => {
    const raw = await cli.get(redisKey(workspaceId, setupSessionId));
    if (!raw) {
      return null;
    }
    let current: CheckoutPayment;
    try {
      current = JSON.parse(raw) as CheckoutPayment;
    } catch {
      return null;
    }
    if (current.contractId !== contractId) {
      return null;
    }
    // Idempotency: if already succeeded, do not overwrite.
    if (current.status === "succeeded") {
      return current;
    }
    const updated = apply(current);
    await cli.set(
      redisKey(workspaceId, setupSessionId),
      JSON.stringify(updated),
      { EX: TTL_SECONDS }
    );
    return updated;
  });
}

export async function markCheckoutPaymentSucceeded({
  workspaceId,
  setupSessionId,
  contractId,
  invoiceId,
}: {
  workspaceId: string;
  setupSessionId: string;
  contractId: string;
  invoiceId: string;
}): Promise<CheckoutPayment | null> {
  return updatePaymentIfContractMatches(
    workspaceId,
    setupSessionId,
    contractId,
    (current) => ({ ...current, status: "succeeded", invoiceId })
  );
}

export async function markCheckoutPaymentFailed({
  workspaceId,
  setupSessionId,
  contractId,
  errorMessage,
  invoiceId,
}: {
  workspaceId: string;
  setupSessionId: string;
  contractId: string;
  errorMessage: string;
  invoiceId?: string;
}): Promise<CheckoutPayment | null> {
  return updatePaymentIfContractMatches(
    workspaceId,
    setupSessionId,
    contractId,
    (current) => ({
      ...current,
      status: "failed",
      errorMessage,
      invoiceId: invoiceId ?? current.invoiceId,
    })
  );
}

// Used when the Metronome call fails synchronously (no webhook will fire).
// Unconditional overwrite of the entry we just wrote.
export async function recordCheckoutPaymentSyncFailure({
  workspaceId,
  setupSessionId,
  errorMessage,
}: {
  workspaceId: string;
  setupSessionId: string;
  errorMessage: string;
}): Promise<void> {
  await runOnRedisCache({ origin: REDIS_ORIGIN }, async (cli) => {
    const raw = await cli.get(redisKey(workspaceId, setupSessionId));
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
    await cli.set(
      redisKey(workspaceId, setupSessionId),
      JSON.stringify(updated),
      { EX: TTL_SECONDS }
    );
  });
}
