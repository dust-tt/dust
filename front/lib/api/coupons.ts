import type { Authenticator } from "@app/lib/auth";
import { amountCents } from "@app/lib/metronome/amounts";
import { listMetronomeCustomerCredits } from "@app/lib/metronome/client";
import { CURRENCY_TO_CREDIT_TYPE_ID } from "@app/lib/metronome/constants";
import type { MetronomeCredit } from "@app/lib/metronome/types";
import { CouponRedemptionResource } from "@app/lib/resources/coupon_redemption_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type {
  GetWorkspaceCouponsResponseBody,
  SeatCouponConsumptionData,
  WorkspaceCouponData,
  WorkspaceCouponStatus,
} from "@app/types/api/coupons";
import type { SupportedCurrency } from "@app/types/currency";
import { isSupportedCurrency } from "@app/types/currency";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

export class WorkspaceCouponsError extends Error {
  constructor(
    readonly type: "not_configured" | "credits_fetch_failed",
    readonly cause?: Error
  ) {
    super(type);
  }
}

function isWorkspaceCouponStatus(
  status: string
): status is WorkspaceCouponStatus {
  return status === "active" || status === "revoked";
}

function currencyFromCreditTypeId(
  creditTypeId: string | undefined
): SupportedCurrency | null {
  if (!creditTypeId) {
    return null;
  }
  const entry = Object.entries(CURRENCY_TO_CREDIT_TYPE_ID).find(
    ([, id]) => id === creditTypeId
  );
  if (!entry) {
    return null;
  }
  const [currency] = entry;
  return isSupportedCurrency(currency) ? currency : null;
}

// Aggregate the Metronome state of the credits granted by a seat coupon
// redemption: total granted amount (access schedule), invoice deductions
// (one per billing period) and remaining balance. Amounts are in cents.
function summarizeSeatCouponCredits(credits: MetronomeCredit[]): {
  currency: SupportedCurrency;
  totalAmountCents: number;
  remainingAmountCents: number;
  consumptions: SeatCouponConsumptionData[];
} | null {
  const currency = currencyFromCreditTypeId(
    credits[0]?.access_schedule?.credit_type?.id
  );
  if (!currency) {
    return null;
  }

  let totalAmountCents = 0;
  let remainingAmountCents = 0;
  const consumptions: SeatCouponConsumptionData[] = [];
  for (const credit of credits) {
    // Note: use metronome for total and not DB to use a single source of truth.
    for (const item of credit.access_schedule?.schedule_items ?? []) {
      totalAmountCents += amountCents(item.amount, currency);
    }
    remainingAmountCents += amountCents(credit.balance ?? 0, currency);
    for (const entry of credit.ledger ?? []) {
      if (
        entry.type === "CREDIT_AUTOMATED_INVOICE_DEDUCTION" &&
        entry.amount < 0
      ) {
        consumptions.push({
          timestampMs: new Date(entry.timestamp).getTime(),
          amountCents: amountCents(-entry.amount, currency),
        });
      }
    }
  }

  return {
    currency,
    totalAmountCents,
    remainingAmountCents,
    consumptions: consumptions.sort((a, b) => a.timestampMs - b.timestampMs),
  };
}

/**
 * List the coupons redeemed by the workspace (active and revoked) with their
 * consumption state. Seat coupons are enriched with the Metronome ledger of
 * the fiat credit they granted; credit pool top-up coupons only carry the
 * redeemed AWU amount (their consumption happens in the shared pool).
 *
 * Fast return without calling metronome when no coupons.
 */
export async function getWorkspaceCoupons(
  auth: Authenticator
): Promise<Result<GetWorkspaceCouponsResponseBody, WorkspaceCouponsError>> {
  const workspace = auth.getNonNullableWorkspace();

  const items = await CouponRedemptionResource.listByWorkspaceAndStatuses(
    auth,
    { statuses: ["active", "revoked"] }
  );
  if (items.length === 0) {
    return new Ok({ coupons: [] });
  }

  const seatCreditIds = [
    ...new Set(
      items
        .filter(({ coupon }) => coupon.discountType === "seat")
        .flatMap(({ redemption }) => redemption.metronomeCreditIds)
    ),
  ];

  // The Metronome list API only filters on a single credit id, so fetch each
  // seat coupon credit (with its ledger) individually rather than paginating
  // through all the customer credits. A workspace has at most a handful of
  // seat coupon redemptions, so this stays a few small requests. Archived
  // credits are included so revoked coupons keep their history.
  const creditById = new Map<string, MetronomeCredit>();
  if (seatCreditIds.length > 0) {
    const { metronomeCustomerId } = workspace;
    if (!metronomeCustomerId) {
      return new Err(new WorkspaceCouponsError("not_configured"));
    }
    const creditsResults = await concurrentExecutor(
      seatCreditIds,
      (creditId) =>
        listMetronomeCustomerCredits({
          metronomeCustomerId,
          creditId,
          includeContractCredits: true,
          includeBalance: true,
          includeLedgers: true,
          includeArchived: true,
        }),
      { concurrency: 4 }
    );
    for (const creditsResult of creditsResults) {
      if (creditsResult.isErr()) {
        return new Err(
          new WorkspaceCouponsError("credits_fetch_failed", creditsResult.error)
        );
      }
      for (const credit of creditsResult.value) {
        creditById.set(credit.id, credit);
      }
    }
  }

  const coupons: WorkspaceCouponData[] = [];
  for (const { redemption, coupon } of items) {
    const { status } = redemption;
    if (!isWorkspaceCouponStatus(status)) {
      continue;
    }
    const base = {
      redemptionId: redemption.sId,
      code: coupon.code,
      status,
      redeemedAtMs: redemption.redeemedAt.getTime(),
    };

    switch (coupon.discountType) {
      case "credit_pool_top_up":
        coupons.push({
          ...base,
          discountType: "credit_pool_top_up",
          amountCredits: coupon.amount,
        });
        break;
      case "seat": {
        const credits = redemption.metronomeCreditIds
          .map((id) => creditById.get(id))
          .filter((c): c is MetronomeCredit => c !== undefined);
        const summary = summarizeSeatCouponCredits(credits);
        if (!summary) {
          logger.warn(
            {
              workspaceId: workspace.sId,
              redemptionId: redemption.sId,
              metronomeCreditIds: redemption.metronomeCreditIds,
            },
            "[Coupons] Seat coupon redemption has no resolvable Metronome credit"
          );
          break;
        }
        coupons.push({ ...base, discountType: "seat", ...summary });
        break;
      }
      default:
        assertNever(coupon.discountType);
    }
  }

  return new Ok({ coupons });
}
