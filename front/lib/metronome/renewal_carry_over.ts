import {
  addComplimentaryCommitToContract,
  addCreditToContract,
  listContractCommitsWithLedger,
  listContractCreditsWithLedger,
} from "@app/lib/metronome/client";
import {
  AWU_PRIORITY_PURCHASED_COMMIT,
  CARRY_ON_RENEWAL_CUSTOM_FIELD_KEY,
  FOREVER_ENDING_BEFORE,
} from "@app/lib/metronome/constants";
import type {
  MetronomeCommit,
  MetronomeCredit,
} from "@app/lib/metronome/types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

type CarryEntry = MetronomeCommit | MetronomeCredit;

/**
 * The balance left when the source entry expired at the transition.
 *
 * When a contract ends, Metronome zeroes each commit/credit with an expiration
 * ledger entry whose (negative) amount is exactly the unused balance — that's
 * the value to carry, not the live `balance` (which reads 0 once expired) nor
 * the granted access amount (which would hand back consumed credit). If no
 * expiration entry is present yet (the source hasn't expired — e.g. a webhook
 * re-delivery race), fall back to the live `balance`.
 */
function carriedAmount(entry: CarryEntry): number {
  // Both commit and credit ledger entries share `{ type, amount }`; normalize to
  // that shape to side-step calling `.filter` on a union of array types.
  const ledger: Array<{ type: string; amount: number }> = entry.ledger ?? [];
  const expirationEntries = ledger.filter(
    (l) =>
      l.type === "PREPAID_COMMIT_EXPIRATION" || l.type === "CREDIT_EXPIRATION"
  );
  if (expirationEntries.length > 0) {
    return -expirationEntries.reduce((sum, l) => sum + l.amount, 0);
  }
  return entry.balance ?? 0;
}

type CarryPlan = {
  amount: number;
  // Access expiry for the re-granted entry. Read from the custom field stamped
  // at grant time (the live window has been clamped to the source contract end
  // by the time we run). A flag with no ISO date carries forever.
  expiry: Date;
  rawExpiry: string;
  creditTypeId: string;
};

// Decide whether and how to carry an entry. Returns a plan, or a reason to skip.
// The expiry comes from `CARRY_ON_RENEWAL_CUSTOM_FIELD_KEY` (stamped at grant
// time) so it survives Metronome clamping the live window at the transition.
// The field is forever-by-default: a non-date value (or a bare marker) carries
// forever; an ISO date carries until then, and is skipped once it's in the past.
function resolveCarryPlan(
  entry: CarryEntry,
  toContractStart: Date
): { plan: CarryPlan } | { skipReason: string } {
  const rawExpiry = entry.custom_fields?.[CARRY_ON_RENEWAL_CUSTOM_FIELD_KEY];
  if (rawExpiry === undefined) {
    return { skipReason: "not flagged" };
  }
  const expiryMs = Date.parse(rawExpiry);
  let expiry: Date;
  if (Number.isNaN(expiryMs)) {
    // No explicit expiry → forever.
    expiry = FOREVER_ENDING_BEFORE;
  } else if (expiryMs <= toContractStart.getTime()) {
    return { skipReason: "expired before transition" };
  } else {
    expiry = new Date(expiryMs);
  }
  const amount = carriedAmount(entry);
  if (amount <= 0) {
    return { skipReason: "no remaining balance" };
  }
  const creditTypeId = entry.access_schedule?.credit_type?.id;
  if (!creditTypeId) {
    return { skipReason: "no access credit type" };
  }
  return { plan: { amount, expiry, rawExpiry, creditTypeId } };
}

/**
 * Carry the unused balance of the source contract's non-recurring commits and
 * credits onto the renewed contract.
 *
 * Invoked from the `contract.start` webhook once a RENEWAL transition has ended
 * the source contract. Only entries stamped `CARRY_ON_RENEWAL_CUSTOM_FIELD_KEY`
 * are carried (initial credits, AWU top-ups, business-activation seat
 * prepayment). Each is re-granted on the successor as a complimentary
 * (no-invoice) commit / credit at its original priority, products, credit type
 * and expiry, and re-stamped so it carries again on the next renewal.
 *
 * Idempotent: each re-grant uses a uniqueness key scoped to the source entry and
 * the successor contract, so webhook re-deliveries do not double-grant.
 */
export async function carryOverContractBalancesOnRenewal({
  metronomeCustomerId,
  fromContractId,
  toContractId,
  toContractStart,
}: {
  metronomeCustomerId: string;
  fromContractId: string;
  toContractId: string;
  toContractStart: Date;
}): Promise<Result<{ carriedCount: number }, Error>> {
  const commitsResult = await listContractCommitsWithLedger({
    metronomeCustomerId,
    contractId: fromContractId,
  });
  if (commitsResult.isErr()) {
    return new Err(commitsResult.error);
  }
  const creditsResult = await listContractCreditsWithLedger({
    metronomeCustomerId,
    contractId: fromContractId,
  });
  if (creditsResult.isErr()) {
    return new Err(creditsResult.error);
  }

  const commits = commitsResult.value.filter(
    (c) => c.custom_fields?.[CARRY_ON_RENEWAL_CUSTOM_FIELD_KEY] !== undefined
  );
  const credits = creditsResult.value.filter(
    (c) => c.custom_fields?.[CARRY_ON_RENEWAL_CUSTOM_FIELD_KEY] !== undefined
  );

  logger.info(
    {
      metronomeCustomerId,
      fromContractId,
      toContractId,
      sourceCommits: commitsResult.value.length,
      sourceCredits: creditsResult.value.length,
      flaggedCommits: commits.length,
      flaggedCredits: credits.length,
    },
    "[Metronome] Renewal carry-over: source entries"
  );

  let carriedCount = 0;

  for (const commit of commits) {
    const resolved = resolveCarryPlan(commit, toContractStart);
    if ("skipReason" in resolved) {
      logger.info(
        {
          metronomeCustomerId,
          fromContractId,
          toContractId,
          commitId: commit.id,
          reason: resolved.skipReason,
        },
        "[Metronome] Renewal carry-over: skipping commit"
      );
      continue;
    }
    const { amount, expiry, rawExpiry, creditTypeId } = resolved.plan;
    const regrant = await addComplimentaryCommitToContract({
      metronomeCustomerId,
      metronomeContractId: toContractId,
      productId: commit.product.id,
      accessAmount: amount,
      accessCreditTypeId: creditTypeId,
      accessStartingAt: toContractStart,
      accessEndingBefore: expiry,
      priority: commit.priority ?? AWU_PRIORITY_PURCHASED_COMMIT,
      name: commit.name ?? "Carried-over balance",
      uniquenessKey: `carry:${toContractId}:${commit.id}`,
      applicableProductIds: commit.applicable_product_ids,
      applicableProductTags: commit.applicable_product_tags,
      customFields: { [CARRY_ON_RENEWAL_CUSTOM_FIELD_KEY]: rawExpiry },
    });
    if (regrant.isErr()) {
      return new Err(regrant.error);
    }
    carriedCount += 1;
  }

  for (const credit of credits) {
    const resolved = resolveCarryPlan(credit, toContractStart);
    if ("skipReason" in resolved) {
      logger.info(
        {
          metronomeCustomerId,
          fromContractId,
          toContractId,
          creditId: credit.id,
          reason: resolved.skipReason,
        },
        "[Metronome] Renewal carry-over: skipping credit"
      );
      continue;
    }
    const { amount, expiry, rawExpiry, creditTypeId } = resolved.plan;
    const regrant = await addCreditToContract({
      metronomeCustomerId,
      metronomeContractId: toContractId,
      productId: credit.product.id,
      creditTypeId,
      amount,
      startingAt: toContractStart.toISOString(),
      endingBefore: expiry.toISOString(),
      priority: credit.priority ?? AWU_PRIORITY_PURCHASED_COMMIT,
      name: credit.name ?? "Carried-over balance",
      uniquenessKey: `carry:${toContractId}:${credit.id}`,
      applicableProductTags: credit.applicable_product_tags,
      customFields: { [CARRY_ON_RENEWAL_CUSTOM_FIELD_KEY]: rawExpiry },
    });
    if (regrant.isErr()) {
      return new Err(regrant.error);
    }
    carriedCount += 1;
  }

  logger.info(
    { metronomeCustomerId, fromContractId, toContractId, carriedCount },
    "[Metronome] Renewal carry-over complete"
  );

  return new Ok({ carriedCount });
}
