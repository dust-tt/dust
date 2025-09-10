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

      return res.status(200).json({
        success: true,
        webhookSourcesWithViews: await concurrentExecutor(
          webhookSourceResources,
          async (webhookSourceResource) => {
            const webhookSource = webhookSourceResource.toJSON();
            const views = (
              await WebhookSourcesViewResource.listByWebhookSource(
                auth,
                webhookSource.id
              )
            ).map((view) => view.toJSON());

            return { ...webhookSource, views };
          },
          {
            concurrency: 10,
          }
        ),
      });
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
