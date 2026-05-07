/** @ignoreswagger */
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { metronomeBalanceToDisplayData } from "@app/lib/api/credits/metronome_balances";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { listMetronomeBalances } from "@app/lib/metronome/client";
import { getCreditTypeProgrammaticUsdId } from "@app/lib/metronome/constants";
import { isMetronomeExcessCredit } from "@app/lib/metronome/types";
import { CreditResource } from "@app/lib/resources/credit_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { CreditDisplayData, CreditType } from "@app/types/credits";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeListCreditsResponseBody>>,
  session: SessionWithUser
): Promise<void> {
  const { wId } = req.query;
  if (typeof wId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you're trying to access was not found.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);

  const owner = auth.workspace();

  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Could not find the workspace.",
      },
    });
  }

  switch (req.method) {
    case "GET":
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
              entry.access_schedule?.credit_type?.id !==
              programmaticUsdCreditTypeId
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
        if (
          metronome.expirationDate !== null &&
          metronome.expirationDate < nowMs
        ) {
          continue;
        }
        rows.push({
          rowKey: `m-${sId}`,
          internal: null,
          metronome,
        });
      }

      return res.status(200).json({
        rows,
        excessCreditsLast30DaysMicroUsd,
        hasMetronome,
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);
