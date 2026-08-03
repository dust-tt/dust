import type { Authenticator } from "@app/lib/auth";
import { listMetronomeBalances } from "@app/lib/metronome/client";
import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import {
  getProductSeatTypes,
  getSeatTypesByProductIdFromContract,
} from "@app/lib/metronome/seat_types";
import type {
  AwuTopUpData,
  GetAwuTopUpsHistoryResponseBody,
} from "@app/types/api/credits/top_ups_history";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export class AwuTopUpsHistoryError extends Error {
  constructor(
    readonly type: "not_configured" | "balances_fetch_failed",
    readonly cause?: Error
  ) {
    super(type);
  }
}

/**
 * List every top-up of the workspace AWU credit pool that has happened so
 * far: purchased credits, free recurring credits, coupon credits and manual
 * grants. Each schedule item of a Metronome pool commit/credit is one
 * top-up, dated by its access start.
 */
export async function getAwuTopUpsHistory(
  auth: Authenticator
): Promise<Result<GetAwuTopUpsHistoryResponseBody, AwuTopUpsHistoryError>> {
  const workspace = auth.getNonNullableWorkspace();
  const subscription = auth.subscription();
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId || !subscription?.metronomeContractId) {
    return new Err(new AwuTopUpsHistoryError("not_configured"));
  }
  const { metronomeContractId } = subscription;

  const now = new Date();

  // Unlike the pool summary, this is a history: drop the covering-date
  // filter so expired grants are returned, and hide future-dated balances.
  const balancesResult = await listMetronomeBalances(metronomeCustomerId, {
    coveringDate: null,
    effectiveBefore: now,
  });
  if (balancesResult.isErr()) {
    return new Err(
      new AwuTopUpsHistoryError("balances_fetch_failed", balancesResult.error)
    );
  }

  // Filter to non-seat AWU pool credits and commits — same filter as the
  // pool summary (`getAwuPoolSummary`). The seat product IDs come from the
  // contract's tagged subscriptions, and the contract filter prevents
  // grants on other contracts from leaking into the history.
  const awuCreditTypeId = getCreditTypeAwuId();
  const activeContract = await getActiveContract(workspace.sId);
  const productSeatTypes = await getProductSeatTypes();
  const seatProductIds = activeContract
    ? new Set(
        getSeatTypesByProductIdFromContract(
          activeContract,
          productSeatTypes
        ).keys()
      )
    : new Set<string>();
  const awuBalances = balancesResult.value.filter(
    (entry) =>
      entry.access_schedule?.credit_type?.id === awuCreditTypeId &&
      !seatProductIds.has(entry.product.id) &&
      (entry.contract?.id === metronomeContractId || !entry.contract)
  );

  const nowMs = now.getTime();
  const topUps: AwuTopUpData[] = [];
  for (const entry of awuBalances) {
    for (const item of entry.access_schedule?.schedule_items ?? []) {
      const grantedAtMs = new Date(item.starting_at).getTime();
      // A recurring credit carries one schedule item per period; items
      // starting in the future are grants that have not happened yet.
      if (grantedAtMs > nowMs) {
        continue;
      }
      topUps.push({
        name: entry.name ?? entry.product.name,
        amountCredits: item.amount,
        grantedAtMs,
        expiresAtMs: new Date(item.ending_before).getTime(),
      });
    }
  }

  return new Ok({
    topUps: topUps.sort((a, b) => b.grantedAtMs - a.grantedAtMs),
  });
}
