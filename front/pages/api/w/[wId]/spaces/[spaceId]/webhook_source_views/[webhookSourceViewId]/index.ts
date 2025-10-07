import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { apiError } from "@app/logger/withlogging";
import type { SpaceKind, WithAPIErrorResponse } from "@app/types";

export type DeleteWebhookSourceViewResponseBody = {
  deleted: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<DeleteWebhookSourceViewResponseBody>
  >,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  const { webhookSourceViewId } = req.query;

  if (typeof webhookSourceViewId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "webhook_source_view_auth_error",
        message: "You are not authorized to access webhook source views.",
      },
    });
  }

  switch (req.method) {
    case "DELETE": {
      if (!auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "webhook_source_view_auth_error",
            message:
              "User is not authorized to remove webhook source views from a space.",
          },
        });
      }

      const webhookSourceView = await WebhookSourcesViewResource.fetchById(
        auth,
        webhookSourceViewId
      );

      if (!webhookSourceView || webhookSourceView.space.id !== space.id) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "webhook_source_view_not_found",
            message: "Webhook Source View not found",
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
              "Can only delete Webhook Source Views from regular or global spaces.",
          },
        });
      }

      try {
        await webhookSourceView.delete(auth, { hardDelete: true });
      } catch (error: any) {
        // Check if it's a Sequelize foreign key constraint error
        if (error?.name === "SequelizeForeignKeyConstraintError") {
          return apiError(req, res, {
            status_code: 409,
            api_error: {
              type: "webhook_source_view_triggering_agent",
              message:
                "Cannot remove webhook source view while it is being used by active agents.",
            },
          });
        }
        // Re-throw other errors
        throw error;
      }
      return res.status(200).json({
        deleted: true,
      });
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, only DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
