import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type { WebhookSourceViewForAdminType } from "@app/types/triggers/webhooks";

export type PokeListWebhookSourceViews = {
  webhookSourceViews: WebhookSourceViewForAdminType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeListWebhookSourceViews>>,
  session: SessionWithUser
): Promise<void> {
  const { wId } = req.query;
  if (typeof wId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);
  switch (req.method) {
    case "GET":
      const webhookSourceViews =
        await WebhookSourcesViewResource.listByWorkspace(auth);

      return res.status(200).json({
        webhookSourceViews: webhookSourceViews.map((wsv) =>
          wsv.toJSONForAdmin()
        ),
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
