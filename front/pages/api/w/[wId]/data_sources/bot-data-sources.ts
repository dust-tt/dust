import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { apiError } from "@app/logger/withlogging";
import type { DataSourceType } from "@app/types/data_source";
import type { WithAPIErrorResponse } from "@app/types/error";

export type GetBotDataSourcesResponseBody = {
  slackBotDataSource: DataSourceType | null;
  microsoftBotDataSource: DataSourceType | null;
  discordBotDataSource: DataSourceType | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetBotDataSourcesResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can access this endpoint.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const [
        [slackBotDataSource],
        [microsoftBotDataSource],
        [discordBotDataSource],
      ] = await Promise.all([
        DataSourceResource.listByConnectorProvider(auth, "slack_bot"),
        DataSourceResource.listByConnectorProvider(auth, "microsoft_bot"),
        DataSourceResource.listByConnectorProvider(auth, "discord_bot"),
      ]);

      return res.status(200).json({
        slackBotDataSource: slackBotDataSource?.toJSON() ?? null,
        microsoftBotDataSource: microsoftBotDataSource?.toJSON() ?? null,
        discordBotDataSource: discordBotDataSource?.toJSON() ?? null,
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
