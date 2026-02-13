import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";

export type PokeGetTriggerExecutionStats = {
  statusBreakdown: Record<string, number>;
  dailyVolume: Array<{
    date: string;
    succeeded: number;
    failed: number;
    notMatched: number;
    rateLimited: number;
  }>;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeGetTriggerExecutionStats>>,
  session: SessionWithUser
): Promise<void> {
  const { wId, tId } = req.query;
  if (!isString(wId) || !isString(tId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid workspace or trigger ID.",
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
        message: "Workspace not found.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const trigger = await TriggerResource.fetchById(auth, tId);
      if (!trigger) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "trigger_not_found",
            message: "Trigger not found.",
          },
        });
      }

      const stats = await WebhookRequestResource.getExecutionStatsForTrigger(
        auth,
        trigger.id
      );

      return res.status(200).json({
        statusBreakdown: stats.statusBreakdown,
        dailyVolume: stats.dailyVolume,
      });
    }

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
