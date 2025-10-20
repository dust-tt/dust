import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";
import type {
  WebhookSourceViewType,
  WebhookSourceViewWithWebhookSourceType,
} from "@app/types/triggers/webhooks";

const GetWebhookSourceViewsRequestSchema = z.object({
  spaceIds: z.array(z.string()),
});

export type GetWebhookSourceViewsListResponseBody = {
  success: boolean;
  webhookSourceViews: WebhookSourceViewType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetWebhookSourceViewsListResponseBody>
  >,
  auth: Authenticator
) {
  const { method } = req;

  switch (method) {
    case "GET": {
      const spaceIds = req.query.spaceIds;

      if (!isString(spaceIds)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid query parameters",
          },
        });
      }

      const normalizedQuery = {
        ...req.query,
        spaceIds: spaceIds.split(","),
      };

      const r = GetWebhookSourceViewsRequestSchema.safeParse(normalizedQuery);
      if (r.error) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(r.error).toString(),
          },
        });
      }

      const query = r.data;

      const webhookSourceViews = await concurrentExecutor(
        query.spaceIds,
        async (spaceId) => {
          const space = await SpaceResource.fetchById(auth, spaceId);
          if (!space || !space.canReadOrAdministrate(auth)) {
            return null;
          }
          const views = await WebhookSourcesViewResource.listBySpace(
            auth,
            space
          );
          return views.map((v) => v.toJSON());
        },
        { concurrency: 10 }
      );

      const flattenedWebhookSourceViews = webhookSourceViews
        .flat()
        .filter((v): v is WebhookSourceViewWithWebhookSourceType => v !== null)
        // map to WebhookSourceViewInfoType: copy all fields but the webhookSource field
        .map(({ webhookSource, ...rest }) => rest);

      return res.status(200).json({
        success: true,
        webhookSourceViews: flattenedWebhookSourceViews,
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
