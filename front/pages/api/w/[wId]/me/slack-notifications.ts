import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetSlackNotificationResponseBody = {
  canConfigure: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetSlackNotificationResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const userResource = auth.user();
  if (!userResource) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message: "User not authenticated.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const slackBotConnections =
        await DataSourceResource.listByConnectorProvider(auth, "slack_bot");

      return res.status(200).json({
        canConfigure: slackBotConnections.length > 0,
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

export default withSessionAuthenticationForWorkspace(handler);
