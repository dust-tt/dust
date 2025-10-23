import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { apiError } from "@app/logger/withlogging";
import type { SpaceKind, WithAPIErrorResponse } from "@app/types";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";

export type GetWebhookSourceViewsResponseBody = {
  success: boolean;
  webhookSourceViews: WebhookSourceViewType[];
};

export type PostWebhookSourceViewResponseBody = {
  success: boolean;
  webhookSourceView: WebhookSourceViewType;
};

const postWebhookSourceViewBodySchema = z.object({
  webhookSourceId: z.string(),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetWebhookSourceViewsResponseBody | PostWebhookSourceViewResponseBody
    >
  >,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  const { method } = req;

  switch (method) {
    case "GET": {
      const webhookSourceViewResources =
        await WebhookSourcesViewResource.listBySpace(auth, space);

      return res.status(200).json({
        success: true,
        webhookSourceViews: webhookSourceViewResources.map(
          (webhookSourceViewResource) => webhookSourceViewResource.toJSON()
        ),
      });
    }
    case "POST": {
      const parseResult = postWebhookSourceViewBodySchema.safeParse(req.body);

      if (!parseResult.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(parseResult.error).toString(),
          },
        });
      }

      const { webhookSourceId } = parseResult.data;

      if (!auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "webhook_source_view_auth_error",
            message:
              "User is not authorized to add webhook sources to a space.",
          },
        });
      }

      const allowedSpaceKinds: SpaceKind[] = ["regular", "global"];
      if (!allowedSpaceKinds.includes(space.kind)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Can only create webhook source views from regular or global spaces.",
          },
        });
      }

      const systemView =
        await WebhookSourcesViewResource.getWebhookSourceViewForSystemSpace(
          auth,
          webhookSourceId
        );

      if (!systemView) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Missing system view for webhook source, it should have been created when adding the webhook source.",
          },
        });
      }

      const webhookSourceView = await WebhookSourcesViewResource.create(auth, {
        systemView,
        space,
      });

      return res.status(200).json({
        success: true,
        webhookSourceView: webhookSourceView.toJSON(),
      });
    }
    default: {
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET and POST are expected",
        },
      });
    }
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
