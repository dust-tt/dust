import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type { WebhookSourceWithViews } from "@app/types/triggers/webhooks";

export type GetWebhookSourcesResponseBody = {
  success: true;
  webhookSourcesWithViews: WebhookSourceWithViews[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetWebhookSourcesResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { method } = req;

  switch (method) {
    case "GET": {
      const webhookSourceResources =
        await WebhookSourceResource.listByWorkspace(auth);

      try {
        const webhookSourcesWithViews = await concurrentExecutor(
          webhookSourceResources,
          async (webhookSourceResource) => {
            const webhookSource = webhookSourceResource.toJSON();
            const webhookSourceViewResources =
              await WebhookSourcesViewResource.listByWebhookSource(
                auth,
                webhookSource.id
              );
            const views = webhookSourceViewResources.map((view) =>
              view.toJSON()
            );

            return { ...webhookSource, views };
          },
          {
            concurrency: 10,
          }
        );

        return res.status(200).json({
          success: true,
          webhookSourcesWithViews,
        });
      } catch (error) {
        return res.status(500).json({
          error: {
            type: "internal_server_error",
            message: "Failed to load webhook source views.",
          },
        });
      }
    }
    default: {
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
    }
  }
}

export default withSessionAuthenticationForWorkspace(handler);
