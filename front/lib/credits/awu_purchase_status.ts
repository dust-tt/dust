import { runOnRedisCache } from "@app/lib/api/redis";
import logger from "@app/logger/logger";

const REDIS_ORIGIN = "awu_purchase_status";

// Status of the latest AWU purchase attempt for a workspace.
// "pending" is set when the Metronome payment-gated commit is created;
// the matching `payment_gate.payment_status` webhook flips it to
// "succeeded" or "failed".
export type AwuPurchaseAttemptStatus = "pending" | "succeeded" | "failed";

export type AwuPurchaseAttempt = {
  status: AwuPurchaseAttemptStatus;
  uniquenessKey: string;
  contractId: string;
  amountCredits: number;
  createdAtMs: number;
  invoiceId?: string;
  errorMessage?: string;
};

export type GetAwuPurchaseStatusResponseBody = {
  attempt: AwuPurchaseAttempt | null;
};

// 1 hour: matches a generous bound on the webhook delivery / UI polling
// window. The UI polls for ~minutes; this TTL gives us margin for retries
// and Stripe-side delays without leaving stale entries lying around.
const TTL_SECONDS = 60 * 60;

function redisKey(workspaceId: string): string {
  return `awu_purchase_status:${workspaceId}`;
}

export async function setAwuPurchaseAttemptPending({
  workspaceId,
  contractId,
  uniquenessKey,
  amountCredits,
}: {
  workspaceId: string;
  contractId: string;
  uniquenessKey: string;
  amountCredits: number;
}): Promise<void> {
  const attempt: AwuPurchaseAttempt = {
    status: "pending",
    uniquenessKey,
    contractId,
    amountCredits,
    createdAtMs: Date.now(),
  };
  await runOnRedisCache({ origin: REDIS_ORIGIN }, async (cli) => {
    await cli.set(redisKey(workspaceId), JSON.stringify(attempt), {
      EX: TTL_SECONDS,
    });
  });
}

export async function getAwuPurchaseAttempt(
  workspaceId: string
): Promise<AwuPurchaseAttempt | null> {
  return runOnRedisCache({ origin: REDIS_ORIGIN }, async (cli) => {
    const raw = await cli.get(redisKey(workspaceId));
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as AwuPurchaseAttempt;
    } catch (err) {
      logger.warn(
        { workspaceId, raw, err },
        "[AWU Purchase Status] Failed to parse stored attempt"
      );
      return null;
    }
  });
}

// Update the stored attempt for the workspace if (and only if) the
// contractId matches what we wrote at purchase time. Mismatched contracts
// could happen on stale webhook deliveries after a contract swap — ignore
// rather than overwrite.
async function updateAttemptIfContractMatches(
  workspaceId: string,
  contractId: string,
  apply: (current: AwuPurchaseAttempt) => AwuPurchaseAttempt
): Promise<AwuPurchaseAttempt | null> {
  return runOnRedisCache({ origin: REDIS_ORIGIN }, async (cli) => {
    const raw = await cli.get(redisKey(workspaceId));
    if (!raw) {
      return null;
    }
    let current: AwuPurchaseAttempt;
    try {
      current = JSON.parse(raw) as AwuPurchaseAttempt;
    } catch {
      return null;
    }
    if (current.contractId !== contractId) {
      return null;
    }
    const updated = apply(current);
    await cli.set(redisKey(workspaceId), JSON.stringify(updated), {
      EX: TTL_SECONDS,
    });
    return updated;
  });
}

export async function markAwuPurchaseAttemptSucceeded({
  workspaceId,
  contractId,
  invoiceId,
}: {
  workspaceId: string;
  contractId: string;
  invoiceId: string;
}): Promise<AwuPurchaseAttempt | null> {
  return updateAttemptIfContractMatches(workspaceId, contractId, (current) => ({
    ...current,
    status: "succeeded",
    invoiceId,
  }));
}

export async function markAwuPurchaseAttemptFailed({
  workspaceId,
  contractId,
  errorMessage,
  invoiceId,
}: {
  workspaceId: string;
  contractId: string;
  errorMessage: string;
  invoiceId?: string;
}): Promise<AwuPurchaseAttempt | null> {
  return updateAttemptIfContractMatches(workspaceId, contractId, (current) => ({
    ...current,
    status: "failed",
    errorMessage: errorMessage,
    invoiceId: invoiceId ?? current.invoiceId,
  }));
}

// Used when the Metronome edit call itself fails synchronously (no webhook
// will ever fire for this attempt). Unconditional overwrite of the entry
// we just wrote.
export async function recordAwuPurchaseAttemptSyncFailure({
  workspaceId,
  errorMessage,
}: {
  workspaceId: string;
  errorMessage: string;
}): Promise<void> {
  await runOnRedisCache({ origin: REDIS_ORIGIN }, async (cli) => {
    const raw = await cli.get(redisKey(workspaceId));
    if (!raw) {
      return;
    }
    let current: AwuPurchaseAttempt;
    try {
      current = JSON.parse(raw) as AwuPurchaseAttempt;
    } catch {
      return;
    }
    const updated: AwuPurchaseAttempt = {
      ...current,
      status: "failed",
      errorMessage: errorMessage,
    };
    await cli.set(redisKey(workspaceId), JSON.stringify(updated), {
      EX: TTL_SECONDS,
    });
  });
}
