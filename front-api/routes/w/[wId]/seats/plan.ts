import { Hono } from "hono";

import type {
  SeatPlanResponseBody,
  SeatTypeInfo,
} from "@app/lib/api/credits/seat_plan";
import { amountCents } from "@app/lib/metronome/amounts";
import { getMetronomeClient } from "@app/lib/metronome/client";
import {
  MAX_SEAT_CREDIT_NAME,
  MAX_SEAT_PRODUCT_NAME,
  PRO_SEAT_CREDIT_NAME,
  PRO_SEAT_PRODUCT_NAME,
} from "@app/lib/metronome/constants";
import { getCreditTypeFromContract } from "@app/lib/metronome/coupons";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";

type PriceKey = "pro" | "max";

// Mounted at /api/w/:wId/seats/plan.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");

  const workspace = auth.getNonNullableWorkspace();
  const contract = await getActiveContract(workspace.sId);

  if (!contract || !contract.rate_card_id) {
    return c.json(
      {
        error: {
          type: "internal_server_error",
          message: "Workspace is not configured for Metronome billing.",
        },
      },
      400
    );
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
    return c.json(
      {
        error: {
          type: "internal_server_error",
          message: "Failed to resolve currency for seat plan.",
        },
      },
      500
    );
  }
  const { currency } = creditTypeResult.value;

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
        // Metronome quotes prices in its per-currency native unit (USD in
        // cents, others in whole units); normalize to actual cents here.
        // TODO (https://github.com/dust-tt/tasks/issues/8072): Add annual pricing
        monthlyPriceCentsMap.set(key, amountCents(entry.rate.price, currency));
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
    return c.json(
      {
        error: {
          type: "internal_server_error",
          message: "Failed to fetch rate schedule for seat products.",
        },
      },
      500
    );
  }

  const buildSeatInfo = (key: PriceKey): SeatTypeInfo | null => {
    const monthlyPriceCents = monthlyPriceCentsMap.get(key);
    if (monthlyPriceCents === undefined) {
      return null;
    }
    return {
      awuCredits: awuCreditsMap.get(key) ?? 0,
      priceCents: monthlyPriceCents,
      currency,
    };
  };

  const body: SeatPlanResponseBody = {
    pro: buildSeatInfo("pro"),
    max: buildSeatInfo("max"),
  };
  return c.json(body);
});

export default app;
