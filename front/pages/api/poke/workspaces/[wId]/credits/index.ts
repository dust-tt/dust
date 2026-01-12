import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type { CreditType } from "@app/types/credits";

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
};

export type PokeListCreditsResponseBody = {
  credits: PokeCreditType[];
  excessCreditsLast30DaysMicroUsd: number;
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

      const [credits, excessCreditsLast30DaysMicroUsd] = await Promise.all([
        CreditResource.listAll(auth),
        CreditResource.sumExcessCreditsInPeriod(auth, {
          periodStart: thirtyDaysAgo,
          periodEnd: now,
        }),
      ]);

      return res.status(200).json({
        credits: credits.map((credit) => credit.toJSONForAdmin()),
        excessCreditsLast30DaysMicroUsd,
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
