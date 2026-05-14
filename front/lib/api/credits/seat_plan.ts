import type { Authenticator } from "@app/lib/auth";
import { getMetronomeClient } from "@app/lib/metronome/client";
import {
  MAX_SEAT_CREDIT_NAME,
  MAX_SEAT_PRODUCT_NAME,
  PRO_SEAT_CREDIT_NAME,
  PRO_SEAT_PRODUCT_NAME,
} from "@app/lib/metronome/constants";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import logger from "@app/logger/logger";
import type { APIError } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export interface SeatTypeInfo {
  awuCredits: number;
  priceCents: number;
}

type PriceKey = "pro" | "max";

export interface SeatPlanResponseBody
  extends Record<PriceKey, SeatTypeInfo | null> {}

type SeatPlanError = {
  status: number;
  error: APIError;
};

export async function getSeatPlan(
  auth: Authenticator
): Promise<Result<SeatPlanResponseBody, SeatPlanError>> {
  const workspace = auth.getNonNullableWorkspace();
  const contract = await getActiveContract(workspace.sId);

  if (!contract || !contract.rate_card_id) {
    return new Err({
      status: 400,
      error: {
        type: "internal_server_error",
        message: "Workspace is not configured for Metronome billing.",
      },
    });
  }

  // Extract per-seat AWU credit amounts from recurring credits on the contract.
  const awuCreditsMap = new Map<PriceKey, number>();
  for (const credit of contract.recurring_credits ?? []) {
    if (credit.name === PRO_SEAT_CREDIT_NAME) {
      awuCreditsMap.set("pro", credit.access_amount.unit_price);
    } else if (credit.name === MAX_SEAT_CREDIT_NAME) {
      awuCreditsMap.set("max", credit.access_amount.unit_price);
    }
  }

  const monthlyPriceCentsMap = new Map<PriceKey, number>();

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
        const key: PriceKey | undefined =
          entry.product_name === PRO_SEAT_PRODUCT_NAME
            ? "pro"
            : entry.product_name === MAX_SEAT_PRODUCT_NAME
              ? "max"
              : undefined;
        if (!key) {
          continue;
        }
        // TODO (https://github.com/dust-tt/tasks/issues/8072): Add annual pricing
        monthlyPriceCentsMap.set(key, entry.rate.price);
      }

      nextPage = rateSchedule.next_page;
    } while (nextPage && monthlyPriceCentsMap.size < 2);
  } catch (err) {
    logger.warn(
      {
        workspaceId: workspace.sId,
        rateCardId: contract.rate_card_id,
        err: normalizeError(err),
      },
      "[Metronome] Failed to fetch rate schedule for seat products"
    );
    return new Err({
      status: 500,
      error: {
        type: "internal_server_error",
        message: "Failed to fetch rate schedule for seat products.",
      },
    });
  }

  const buildSeatInfo = (key: PriceKey): SeatTypeInfo | null => {
    const monthlyPriceCents = monthlyPriceCentsMap.get(key);
    if (monthlyPriceCents === undefined) {
      return null;
    }
    return {
      awuCredits: awuCreditsMap.get(key) ?? 0,
      priceCents: monthlyPriceCents,
    };
  };

  return new Ok({
    pro: buildSeatInfo("pro"),
    max: buildSeatInfo("max"),
  });
}
