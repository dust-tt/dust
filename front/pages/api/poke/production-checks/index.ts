import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import {
  getLatestProductionCheckResults,
  statusToSummaryStatus,
} from "@app/lib/production_checks/history";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import { apiError } from "@app/logger/withlogging";
import { REGISTERED_CHECKS } from "@app/temporal/production_checks/activities";
import type { CheckSummary, CheckSummaryStatus } from "@app/types";
import type { WithAPIErrorResponse } from "@app/types";

export type GetProductionChecksResponseBody = {
  checks: CheckSummary[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetProductionChecksResponseBody>>,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(session, null);

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const client = await getTemporalClientForFrontNamespace();
  const checkResultsByName = await getLatestProductionCheckResults(client);

  // Build check summaries for all registered checks
  const checks: CheckSummary[] = REGISTERED_CHECKS.map((registeredCheck) => {
    const latestResult = checkResultsByName.get(registeredCheck.name);

    if (!latestResult) {
      return {
        name: registeredCheck.name,
        everyHour: registeredCheck.everyHour,
        status: "no-data" as const,
        lastRun: null,
      };
    }

    return {
      name: registeredCheck.name,
      everyHour: registeredCheck.everyHour,
      status: statusToSummaryStatus(latestResult.status),
      lastRun: {
        timestamp: latestResult.timestamp,
        errorMessage: latestResult.errorMessage,
        payload: latestResult.payload,
        actionLinks: latestResult.actionLinks,
      },
    };
  });

  // Sort: alerts first, then ok, then no-data
  const statusOrder: Record<CheckSummaryStatus, number> = {
    alert: 0,
    ok: 1,
    "no-data": 2,
  };
  checks.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  return res.status(200).json({ checks });
}

export default withSessionAuthenticationForPoke(handler);
