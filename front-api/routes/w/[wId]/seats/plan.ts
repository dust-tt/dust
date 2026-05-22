import type {
  SeatBillingFrequency,
  SeatPlanResponseBody,
  SeatTypeInfo,
} from "@app/lib/api/credits/seat_plan";
import { getSeatBillingFrequency } from "@app/lib/api/credits/seat_plan";
import { amountCents } from "@app/lib/metronome/amounts";
import { getMetronomeClient } from "@app/lib/metronome/client";
import { getCreditTypeFromContract } from "@app/lib/metronome/coupons";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import {
  getAwuAllocationInfoForSeatType,
  getProductSeatTypes,
  getSeatSubscriptionsFromContract,
  getSeatTypesByProductIdFromContract,
  isMauContract,
} from "@app/lib/metronome/seat_types";
import logger from "@app/logger/logger";
import type { MembershipSeatType } from "@app/types/memberships";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/seats/plan.
const app = workspaceApp();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");

  const workspace = auth.getNonNullableWorkspace();
  const contract = await getActiveContract(workspace.sId);

  if (!contract || !contract.rate_card_id) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "internal_server_error",
        message: "Workspace is not configured for Metronome billing.",
      },
    });
  }

  const creditTypeResult = await getCreditTypeFromContract(contract);
  if (creditTypeResult.isErr()) {
    logger.warn(
      {
        workspaceId: workspace.sId,
        rateCardId: contract.rate_card_id,
        err: creditTypeResult.error,
      },
      "[Metronome] Failed to resolve contract currency for seat plan"
    );
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to resolve currency for seat plan.",
      },
    });
  }
  const { currency } = creditTypeResult.value;

  // MAU contracts don't bill per-seat — return an empty seat plan up-front.
  if (isMauContract(contract)) {
    const empty: SeatPlanResponseBody = {};
    return ctx.json(empty);
  }

  // Build `productId → seatType` from contract subscriptions so we can resolve
  // rate-schedule entries without comparing product names or IDs.
  const productSeatTypes = await getProductSeatTypes();
  const seatTypesByProductId = getSeatTypesByProductIdFromContract(
    contract,
    productSeatTypes
  );
  if (seatTypesByProductId.size === 0) {
    const empty: SeatPlanResponseBody = {};
    return ctx.json(empty);
  }

  // Resolve each seat's billing frequency from the matching subscription on
  // the contract. Keep the full Metronome cadence in the response so callers
  // don't need to assume that all non-annual seats are monthly.
  const billingFrequencyBySeatType = new Map<
    MembershipSeatType,
    SeatBillingFrequency
  >();
  const seatSubscriptions = getSeatSubscriptionsFromContract(
    contract,
    productSeatTypes
  );
  for (const [seatType, sub] of seatSubscriptions) {
    billingFrequencyBySeatType.set(
      seatType,
      getSeatBillingFrequency(sub.subscription_rate.billing_frequency)
    );
  }

  const monthlyPriceCentsBySeatType = new Map<MembershipSeatType, number>();
  const nameBySeatType = new Map<MembershipSeatType, string>();
  try {
    const startingAt = new Date().toISOString();
    let nextPage: string | null | undefined = undefined;
    do {
      const rateSchedule =
        await getMetronomeClient().v1.contracts.rateCards.retrieveRateSchedule({
          rate_card_id: contract.rate_card_id,
          starting_at: startingAt,
          ...(nextPage ? { next_page: nextPage } : {}),
        });

      for (const entry of rateSchedule.data ?? []) {
        if (!entry.entitled || entry.rate.price === undefined) {
          continue;
        }
        const seatType = seatTypesByProductId.get(entry.product_id);
        if (!seatType) {
          continue;
        }
        // Metronome quotes prices in its per-currency native unit (USD in
        // cents, others in whole units); normalize to actual cents here.
        // TODO (https://github.com/dust-tt/tasks/issues/8072): Add annual pricing
        monthlyPriceCentsBySeatType.set(
          seatType,
          amountCents(entry.rate.price, currency)
        );
        nameBySeatType.set(seatType, entry.product_name);
      }

      nextPage = rateSchedule.next_page;
    } while (
      nextPage &&
      monthlyPriceCentsBySeatType.size < seatTypesByProductId.size
    );
  } catch (err) {
    const normalized = normalizeError(err);
    logger.warn(
      {
        workspaceId: workspace.sId,
        rateCardId: contract.rate_card_id,
        err: normalized,
      },
      "[Metronome] Failed to fetch rate schedule for seat products"
    );
    return apiError(
      ctx,
      {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to fetch rate schedule for seat products.",
        },
      },
      normalized
    );
  }

  const response: SeatPlanResponseBody = {};
  for (const seatType of seatTypesByProductId.values()) {
    const priceCents = monthlyPriceCentsBySeatType.get(seatType);
    const name = nameBySeatType.get(seatType);
    if (priceCents === undefined || name === undefined) {
      continue;
    }
    const awuAllocation = getAwuAllocationInfoForSeatType(
      contract,
      seatType,
      productSeatTypes
    );
    const info: SeatTypeInfo = {
      name,
      awuCredits: awuAllocation.credits,
      awuCreditsPeriod: awuAllocation.period,
      priceCents,
      currency,
      billingFrequency: billingFrequencyBySeatType.get(seatType) ?? "monthly",
    };
    response[seatType] = info;
  }
  return ctx.json(response);
});

export default app;
