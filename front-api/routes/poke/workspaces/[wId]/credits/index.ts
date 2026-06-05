import { metronomeBalanceToDisplayData } from "@app/lib/api/credits/metronome_balances";
import { listMetronomeBalances } from "@app/lib/metronome/client";
import { getCreditTypeProgrammaticUsdId } from "@app/lib/metronome/constants";
import { isMetronomeExcessCredit } from "@app/lib/metronome/types";
import { CreditResource } from "@app/lib/resources/credit_resource";
import logger from "@app/logger/logger";
import type { CreditDisplayData, CreditType } from "@app/types/credits";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

import awuPoolSummary from "./awu-pool-summary";
import membersUsage from "./members-usage";

export type PokeCreditType = {
  id: number;
  createdAt: string;
  type: CreditType;
  initialAmountMicroUsd: number;
  consumedAmountMicroUsd: number;
  remainingAmountMicroUsd: number;
  startDate: string | null;
  expirationDate: string | null;
  discount: number | null;
  invoiceOrLineItemId: string | null;
  metronomeCreditId: string | null;
};

export type PokeUnifiedCreditRow = {
  rowKey: string;
  internal: PokeCreditType | null;
  metronome: CreditDisplayData | null;
};

export type PokeListCreditsResponseBody = {
  rows: PokeUnifiedCreditRow[];
  excessCreditsLast30DaysMicroUsd: number;
  hasMetronome: boolean;
};

// Mounted at /api/poke/workspaces/:wId/credits.
const app = pokeApp();

app.get("/", async (ctx): HandlerResult<PokeListCreditsResponseBody> => {
  const auth = ctx.get("auth");
  const owner = auth.getNonNullableWorkspace();

  const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000;
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - DAYS_30_MS);

  const { metronomeCustomerId } = owner;
  const hasMetronome = metronomeCustomerId !== null;

  const [credits, excessCreditsLast30DaysMicroUsd, metronomeBalances] =
    await Promise.all([
      CreditResource.listAll(auth),
      CreditResource.sumExcessCreditsInPeriod(auth, {
        periodStart: thirtyDaysAgo,
        periodEnd: now,
      }),
      metronomeCustomerId
        ? listMetronomeBalances(metronomeCustomerId, {
            // Drop the `covering_date` filter so we still see expired
            // balances (needed to cross-check against DB credits), but cap
            // with `effective_before: now` to hide future-dated ones.
            // `includeArchived` stays false so balances on archived
            // contracts are excluded by Metronome itself.
            coveringDate: null,
            effectiveBefore: now,
            onlyPoolCredits: false,
          })
        : null,
    ]);

  const metronomeBySId = new Map<string, CreditDisplayData>();
  if (metronomeBalances) {
    if (metronomeBalances.isErr()) {
      logger.error(
        {
          workspaceId: owner.sId,
          error: metronomeBalances.error.message,
        },
        "[Poke Credits] Failed to retrieve Metronome balances"
      );
    } else {
      const programmaticUsdCreditTypeId = getCreditTypeProgrammaticUsdId();
      for (const entry of metronomeBalances.value) {
        if (
          entry.access_schedule?.credit_type?.id !== programmaticUsdCreditTypeId
        ) {
          continue;
        }
        if (isMetronomeExcessCredit(entry)) {
          continue;
        }
        metronomeBySId.set(entry.id, metronomeBalanceToDisplayData(entry));
      }
    }
  }

  const rows: PokeUnifiedCreditRow[] = [];
  const matchedSIds = new Set<string>();

  for (const credit of credits) {
    const internal = credit.toJSONForAdmin();
    const metronome =
      internal.metronomeCreditId !== null
        ? (metronomeBySId.get(internal.metronomeCreditId) ?? null)
        : null;
    if (metronome !== null && internal.metronomeCreditId !== null) {
      matchedSIds.add(internal.metronomeCreditId);
    }
    rows.push({
      rowKey: `c-${internal.id}`,
      internal,
      metronome,
    });
  }

  const nowMs = Date.now();
  for (const [sId, metronome] of metronomeBySId) {
    if (matchedSIds.has(sId)) {
      continue;
    }
    // Expired credits are fetched only to surface matches against internal
    // records; unmatched expired entries should not show up as
    // "Metronome only" noise.
    if (metronome.expirationDate !== null && metronome.expirationDate < nowMs) {
      continue;
    }
    rows.push({
      rowKey: `m-${sId}`,
      internal: null,
      metronome,
    });
  }

  return ctx.json({
    rows,
    excessCreditsLast30DaysMicroUsd,
    hasMetronome,
  });
});

app.route("/awu-pool-summary", awuPoolSummary);
app.route("/members-usage", membersUsage);

export default app;
