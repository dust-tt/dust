import type { Authenticator } from "@app/lib/auth";
import { amountCents } from "@app/lib/metronome/amounts";
import { getMetronomeClient } from "@app/lib/metronome/client";
import { getCreditTypeFromContract } from "@app/lib/metronome/coupons";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import {
  getAwuAllocationForSeatType,
  getProductSeatTypes,
  getSeatTypesByProductIdFromContract,
  isMauContract,
} from "@app/lib/metronome/seat_types";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { SupportedCurrency } from "@app/types/currency";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { MembershipSeatType } from "@app/types/memberships";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { NextApiRequest, NextApiResponse } from "next";

export interface SeatTypeInfo {
  // Human-readable plan name surfaced by Metronome (e.g. "Pro Seat") — use
  // for display so the UI doesn't need to know about specific seat types.
  name: string;
  awuCredits: number;
  priceCents: number;
  currency: SupportedCurrency;
}

// Dynamic seat-type → info map. The list of seat types is driven by the
// contract's subscriptions (each tagged with the `DUST_SEAT_TYPE` custom
// field) — not a hardcoded "pro" / "max" enum.
export type SeatPlanResponseBody = Partial<
  Record<MembershipSeatType, SeatTypeInfo>
>;

export async function handleSeatPlanRequest(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<SeatPlanResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only GET is supported.",
      },
    });
  }

  const workspace = auth.getNonNullableWorkspace();
  const contract = await getActiveContract(workspace.sId);

  if (!contract || !contract.rate_card_id) {
    return apiError(req, res, {
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
    return apiError(req, res, {
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
    return res.status(200).json({});
  }

  // Build `productId → seatType` from contract subscriptions so we can resolve
  // rate-schedule entries without comparing product names or IDs.
  const productSeatTypes = await getProductSeatTypes();
  const seatTypesByProductId = getSeatTypesByProductIdFromContract(
    contract,
    productSeatTypes
  );
  if (seatTypesByProductId.size === 0) {
    return res.status(200).json({});
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
    logger.warn(
      {
        workspaceId: workspace.sId,
        rateCardId: contract.rate_card_id,
        err: normalizeError(err),
      },
      "[Metronome] Failed to fetch rate schedule for seat products"
    );
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to fetch rate schedule for seat products.",
      },
    });
  }

  const response: SeatPlanResponseBody = {};
  for (const seatType of seatTypesByProductId.values()) {
    const priceCents = monthlyPriceCentsBySeatType.get(seatType);
    const name = nameBySeatType.get(seatType);
    if (priceCents === undefined || name === undefined) {
      continue;
    }
    response[seatType] = {
      name,
      awuCredits: getAwuAllocationForSeatType(
        contract,
        seatType,
        productSeatTypes
      ),
      priceCents,
      currency,
    };
  }
  return res.status(200).json(response);
}
